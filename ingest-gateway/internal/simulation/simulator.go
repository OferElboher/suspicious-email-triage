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
type Controller struct {
	// mu is a sync.Mutex. HTTP Start/Stop/Status and emitOne ticks can run on different goroutines.
	// mu protects running, rate, seq, and cancel as one logical state.
	// Why sync.Mutex: short critical sections (check running, bump seq) — exclusive lock is enough.
	// Why not sync.RWMutex: Status() is infrequent; seq++ is a write — readers would block anyway.
	// Why not a chan struct{}: no work queue to drain — only guarding a few struct fields.
	// Why not sync/atomic on running alone: Start sets running+rate+cancel together — need one lock.
	mu      sync.Mutex
	running bool
	rate    int
	maxRate int
	seq     int64
	cancel  context.CancelFunc
	stats   *stats.Store
	backend *backend.Client
	onResult func(success bool, backendFailure bool)
}

// NewController constructs a simulation controller tied to stats and the Node client.
func NewController(maxRate int, store *stats.Store, client *backend.Client, onResult func(bool, bool)) *Controller {
	return &Controller{
		maxRate:  maxRate,
		stats:    store,
		backend:  client,
		onResult: onResult,
	}
}

// Start enables simulation at emailsPerMinute (clamped to maxRate).
func (c *Controller) Start(emailsPerMinute int) error {
	// Acquire c.mu (Controller.sync.Mutex): running/rate/cancel must update atomically before go c.loop.
	c.mu.Lock()
	defer c.mu.Unlock() // Release c.mu
	if c.running {
		return fmt.Errorf("simulation already running")
	}
	rate := emailsPerMinute
	if rate < 1 {
		rate = 1
	}
	if rate > c.maxRate {
		rate = c.maxRate
	}
	ctx, cancel := context.WithCancel(context.Background())
	c.running = true
	c.rate = rate
	c.cancel = cancel
	c.stats.SetSimulationState(true, rate)
	go c.loop(ctx, rate)
	return nil
}

// Stop cancels the simulation goroutine and clears dashboard simulation flags.
func (c *Controller) Stop() {
	// Acquire c.mu (Controller.sync.Mutex): Stop must not call cancel() while Start is mid-flight.
	c.mu.Lock()
	defer c.mu.Unlock() // Release c.mu
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
func (c *Controller) Status() (enabled bool, rate int) {
	// Acquire c.mu (Controller.sync.Mutex): read running+rate as one pair — sync/atomic.Bool alone cannot cover rate.
	c.mu.Lock()
	defer c.mu.Unlock() // Release c.mu
	return c.running, c.rate
}

// loop ticks at the requested interval until context cancellation.
func (c *Controller) loop(ctx context.Context, rate int) {
	interval := time.Minute / time.Duration(rate)
	if interval < time.Millisecond {
		interval = time.Millisecond
	}
	ticker := time.NewTicker(interval)
	minuteReset := time.NewTicker(time.Minute)
	defer ticker.Stop()
	defer minuteReset.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-minuteReset.C:
			c.stats.ResetMinuteCounter()
		case <-ticker.C:
			c.emitOne(ctx)
		}
	}
}

// emitOne creates a single synthetic review via the Node internal API.
func (c *Controller) emitOne(ctx context.Context) {
	// Acquire c.mu (Controller.sync.Mutex): hold only for seq++ — not for HTTP (would block Start/Stop).
	c.mu.Lock()
	c.seq++
	n := c.seq
	// Release c.mu before CreateMailboxReview — sync.Mutex must not cover network I/O; channels would still need seq guard.
	c.mu.Unlock()

	tmpl := simulationtemplates.Pick(n)
	senderEmail, externalMessageID := simulationtemplates.CorrelationIDs(tmpl, n)

	payload := backend.EmailPayload{
		SenderName:        tmpl.SenderName,
		SenderEmail:       senderEmail,
		Subject:           fmt.Sprintf("%s (#%d)", tmpl.Subject, n),
		Body:              tmpl.Body,
		Source:            "mailbox_simulation",
		ExternalMessageID: externalMessageID,
		IngestClientID:    "dev-mock",
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
