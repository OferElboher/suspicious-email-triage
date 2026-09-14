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
	// mu is a sync.Mutex — Go's standard exclusive lock (Lock / Unlock).
	// In Go, "mutex" and "lock" refer to the same idea: only one goroutine may hold mu at a time.
	//
	// Why any lock is required: HTTP handlers call Start/Stop/Status on one goroutine while the
	// simulation loop calls emitOne on another. Those functions all read and write running, rate,
	// seq, and cancel. Without mu, Start and Stop could overlap and leave running=true with a
	// stale cancel function, or two loop goroutines could run at once.
	//
	// Why sync.Mutex and not sync.RWMutex: Status() reads two fields occasionally, but emitOne
	// writes seq on every tick and Start/Stop write several fields. A read/write lock helps when
	// reads dominate; here writes are common, so RWMutex would still block often with extra rules.
	//
	// Why not sync/atomic on running or seq alone: Start atomically sets running, rate, and cancel
	// together before spawning the loop. Protecting only one field with atomics would still leave
	// the other fields racy — we need one lock covering the whole Controller state.
	//
	// Why not a channel (chan struct{} or work queue): we are not sending jobs to a worker — we
	// only need to guard a handful of struct fields. A channel adds a goroutine and still needs
	// locking inside the receiver for the same fields.
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
	// Lock c.mu (Controller.sync.Mutex): check-then-act on running, then set running, rate, and
	// cancel before spawning the loop goroutine. Without this exclusive lock, two concurrent Start
	// requests could both see running=false and launch two loops. Mutex is the right tool because
	// several fields must change together; atomics or a bare "lock flag" cannot do that safely.
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
	// Lock c.mu (Controller.sync.Mutex): Stop reads running and calls cancel() while Start may
	// still be assigning cancel on another goroutine. The Mutex ensures Stop waits until Start
	// finishes its critical section — otherwise cancel could be nil or point at the wrong context.
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
func (c *Controller) Status() (enabled bool, rate int) {
	// Lock c.mu (Controller.sync.Mutex): return running and rate as a matched pair. Without the
	// lock, Stop could set running=false between reading the two fields and the caller would see
	// "stopped but rate still 10/min". RWMutex.RLock was not used because this read is rare and
	// seq++ in emitOne is a write that would block readers anyway.
	c.mu.Lock()
	defer c.mu.Unlock()
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
	// Lock c.mu (Controller.sync.Mutex): hold only long enough to increment seq and copy the value.
	// We deliberately Unlock before the HTTP call below — keeping mu locked during network I/O
	// would block Start/Stop for the entire Node round-trip (potentially seconds). That is why
	// a Mutex with a short critical section beats a channel or a single global lock around emit.
	c.mu.Lock()
	c.seq++
	n := c.seq
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
