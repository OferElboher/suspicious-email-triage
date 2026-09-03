// Package simulation runs dev-only synthetic mailbox traffic at a configurable rate.
//
// Purpose: load-test the ingest → Kafka → Celery pipeline without connecting to real M365/Gmail APIs.
//
// Usage flow:
//  React #ingest "Start simulation" → Node proxy → POST /v1/simulation/start (handler)
//  → Controller.Start(rate) → background goroutine loop → emitOne each tick
//  → backend.CreateMailboxReview (same path as real webhooks)
//  → stats + Prometheus updated for dashboard charts
//
// Non-dev guard: handler returns 403 before calling Start when DEPLOYMENT_ENV != dev.
// The Controller struct is always constructed in main.go; only Start/Stop are gated.
package simulation

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/backend"
	gwlogger "github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/logger"
	simulationtemplates "github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/simulationtemplates"
	"github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/stats"
)

// Controller owns the background goroutine that emits synthetic emails.
//
// Usage flow:
//  NewController (main.go) → Start (HTTP) → loop goroutine → emitOne → Stop (HTTP or process exit)
type Controller struct {
	mu       sync.Mutex       // serializes Start/Stop/Status vs seq increment
	running  bool             // true while loop goroutine is active
	rate     int              // current emails per minute (after clamping to maxRate)
	maxRate  int              // upper bound from MAILBOX_INGEST_MAX_EVENTS_PER_MIN env
	seq      int64            // monotonic counter — unique sender address and template rotation
	cancel   context.CancelFunc // calling cancel() stops loop via ctx.Done()
	stats    *stats.Store     // in-memory dashboard counters updated on each emit
	backend  *backend.Client  // same Node client used for real webhook ingest
	onResult func(success bool, backendFailure bool) // optional bridge to Prometheus in main.go
}

// NewController constructs a simulation controller tied to stats and the Node client.
//
// Usage: called once from main.go; the returned pointer is shared with handler.API.
func NewController(maxRate int, store *stats.Store, client *backend.Client, onResult func(bool, bool)) *Controller {
	return &Controller{
		maxRate:  maxRate,
		stats:    store,
		backend:  client,
		onResult: onResult,
	}
}

// Start enables simulation at emailsPerMinute (clamped to maxRate).
//
// Usage flow:
//  POST /v1/simulation/start → Start → spawns loop goroutine → returns immediately to HTTP client.
//  Returns error if simulation is already running.
func (c *Controller) Start(emailsPerMinute int) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.running {
		return fmt.Errorf("simulation already running")
	}
	rate := emailsPerMinute
	if rate < 1 {
		rate = 1
	}
	if rate > c.maxRate {
		rate = c.maxRate // UI cannot exceed MAILBOX_INGEST_MAX_EVENTS_PER_MIN
	}
	// context.WithCancel: Stop() calls cancel() so loop exits cleanly without os.Exit.
	ctx, cancel := context.WithCancel(context.Background())
	c.running = true
	c.rate = rate
	c.cancel = cancel
	c.stats.SetSimulationState(true, rate)
	go c.loop(ctx, rate) // fire-and-forget — HTTP handler must not block on ticks
	return nil
}

// Stop cancels the simulation goroutine and clears dashboard simulation flags.
//
// Usage flow: POST /v1/simulation/stop → Stop → loop receives ctx.Done() and returns.
func (c *Controller) Stop() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.running {
		return
	}
	c.running = false
	if c.cancel != nil {
		c.cancel()
	}
	c.stats.SetSimulationState(false, 0)
}

// Status returns whether simulation is active and the configured rate.
//
// Usage flow: GET /v1/simulation/status and dashboard polling read these values.
func (c *Controller) Status() (enabled bool, rate int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.running, c.rate
}

// loop ticks at the requested interval until context cancellation.
//
// Usage: started only from Start — not called directly by handlers.
// Runs three concurrent timers via select: tick emit, minute counter reset, cancel.
func (c *Controller) loop(ctx context.Context, rate int) {
	interval := time.Minute / time.Duration(rate) // e.g. 10/min → one email every 6 seconds
	if interval < time.Millisecond {
		interval = time.Millisecond // safety floor for absurdly high dev rates
	}
	ticker := time.NewTicker(interval)
	minuteReset := time.NewTicker(time.Minute) // aligns lastMinuteReceived with dashboard "Last minute" stat
	defer ticker.Stop()
	defer minuteReset.Stop()

	for {
		select {
		case <-ctx.Done():
			return // Stop() was called
		case <-minuteReset.C:
			c.stats.ResetMinuteCounter()
		case <-ticker.C:
			c.emitOne(ctx)
		}
	}
}

// emitOne creates a single synthetic review via the Node internal API.
//
// Usage flow:
//  loop tick → emitOne → Pick template → CreateMailboxReview → stats.RecordSuccess/RecordError
func (c *Controller) emitOne(ctx context.Context) {
	c.mu.Lock()
	c.seq++
	n := c.seq
	c.mu.Unlock() // release lock before network I/O — never hold mutex during HTTP

	tmpl := simulationtemplates.Pick(n)
	senderEmail, externalMessageID := simulationtemplates.CorrelationIDs(tmpl, n)

	payload := backend.EmailPayload{
		SenderName:        tmpl.SenderName,
		SenderEmail:       senderEmail,
		Subject:           fmt.Sprintf("%s (#%d)", tmpl.Subject, n),
		Body:              tmpl.Body,
		Source:            "mailbox_simulation",
		ExternalMessageID: externalMessageID,
		IngestClientID:    "dev-mock", // routes verdict webhook to mock-verdict-callback in dev
	}
	_, err := c.backend.CreateMailboxReview(ctx, payload)
	if err != nil {
		c.stats.RecordError(true)
		gwlogger.Warn("simulation", "synthetic mailbox emit failed", map[string]interface{}{
			"seq": n, "error": err.Error(),
		})
		if c.onResult != nil {
			c.onResult(false, true)
		}
		return
	}
	c.stats.RecordSuccess("simulation", true)
	if c.onResult != nil {
		c.onResult(true, false)
	}
}
