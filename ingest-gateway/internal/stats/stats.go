// Package stats tracks in-memory counters and a rolling time series for the ingest dashboard.
//
// Usage flow:
//  main → NewStore → handler/simulation call RecordSuccess/RecordError on each ingest attempt
//  → GET /v1/stats/dashboard → Snapshot JSON → Node proxy → React #ingest Recharts
//
// Data is in-memory only — counters reset when the container restarts (acceptable for dev demos).
package stats

import (
	"sync"
	"time"
)

const maxBuckets = 60 // keep last 60 minutes of per-minute chart data

// Bucket is one minute of ingest activity for frontend bar charts.
type Bucket struct {
	Minute          time.Time `json:"minute"`
	Received        int64     `json:"received"`
	Simulation      int64     `json:"simulation"`
	Webhook         int64     `json:"webhook"`
	Errors          int64     `json:"errors"`
	BackendFailures int64     `json:"backendFailures"`
}

// Store aggregates gateway usage for GET /v1/stats/dashboard.
//
// Usage: one Store per process, shared by handler.API and simulation.Controller.
type Store struct {
	// mu is a sync.Mutex — Go's built-in mutual-exclusion lock (Lock / Unlock).
	// In Go there is no separate "Lock" type; sync.Mutex is the standard way to serialize
	// access when multiple goroutines read and write the same memory.
	//
	// Why any lock is required: real webhook HTTP handlers and the simulation background
	// goroutine both update this struct at the same time. Without mu, two goroutines could
	// increment totals and resize the buckets slice in an interleaved order, producing
	// lost counts or a corrupted time series for the dashboard charts.
	//
	// Why sync.Mutex (exclusive lock) and not sync.RWMutex (read/write lock): Snapshot must
	// copy totals and the buckets slice as one consistent snapshot. RWMutex would allow many
	// concurrent readers, but every ingest still writes — readers and writers would block each
	// other anyway at dev traffic levels, while RWMutex adds extra API surface for no gain.
	//
	// Why not sync/atomic on individual int64 fields: RecordSuccess also appends or truncates
	// the buckets slice via touchCurrentBucket. Atomics protect single numbers, not a slice
	// plus its related totals updated together as one logical operation.
	//
	// Why not a channel and a dedicated stats goroutine: there is no stream of messages to
	// queue — just shared counters updated from many call sites. A channel would add latency,
	// another goroutine to manage, and still require locking inside the consumer.
	mu sync.Mutex

	totalReceived        int64
	totalSimulation      int64
	totalWebhook         int64
	totalErrors          int64
	totalBackendFailures int64
	lastMinuteReceived   int64 // rolling counter; ResetMinuteCounter clears each minute
	buckets              []Bucket
	simulationEnabled    bool
	simulationRate       int
}

// NewStore constructs an empty statistics store at process startup.
func NewStore() *Store {
	return &Store{buckets: make([]Bucket, 0, maxBuckets)}
}

// RecordSuccess increments counters after Node accepted the review (HTTP 2xx from backend.Client).
func (s *Store) RecordSuccess(source string, simulation bool) {
	// Lock s.mu (Store.sync.Mutex): a webhook handler or simulation tick is about to bump several
	// int64 totals and update the current minute bucket. The exclusive lock ensures no other
	// goroutine can run the same update halfway through — which would mix two events into one
	// broken bucket or drop a count. Atomics cannot cover slice append; a channel is overkill here.
	s.mu.Lock()
	defer s.mu.Unlock()
	s.totalReceived++
	s.lastMinuteReceived++
	if simulation {
		s.totalSimulation++
	} else {
		s.totalWebhook++
	}
	s.touchCurrentBucket(func(b *Bucket) {
		b.Received++
		if simulation {
			b.Simulation++
		} else {
			b.Webhook++
		}
	})
}

// RecordError increments failure counters (validation errors or Node HTTP failures).
func (s *Store) RecordError(backendFailure bool) {
	// Lock s.mu (Store.sync.Mutex): same reason as RecordSuccess — error paths also mutate totals
	// and the buckets slice. Using the same Mutex keeps one simple rule: all Store mutations
	// go through s.mu, instead of mixing Mutex + atomics + channels.
	s.mu.Lock()
	defer s.mu.Unlock()
	s.totalErrors++
	if backendFailure {
		s.totalBackendFailures++
	}
	s.touchCurrentBucket(func(b *Bucket) {
		b.Errors++
		if backendFailure {
			b.BackendFailures++
		}
	})
}

// SetSimulationState updates simulation metadata shown in dashboard rates section.
func (s *Store) SetSimulationState(enabled bool, rate int) {
	// Lock s.mu (Store.sync.Mutex): simulationEnabled and simulationRate are two fields that
	// Snapshot reads together. Without the lock, Start could set enabled=true while another
	// goroutine still sees the old rate — the UI would show inconsistent simulation status.
	s.mu.Lock()
	defer s.mu.Unlock()
	s.simulationEnabled = enabled
	s.simulationRate = rate
}

// Snapshot returns a JSON-serializable dashboard payload for GET /v1/stats/dashboard.
func (s *Store) Snapshot(maxRate int, uptimeSeconds int64) map[string]interface{} {
	// Lock s.mu (Store.sync.Mutex): exclusive lock while copying buckets so no Record* call can
	// append or truncate the slice mid-copy (which would panic or return torn chart data).
	// We use Mutex.Lock here instead of RWMutex.RLock because writers are frequent and a
	// read/write lock would not materially improve throughput for this dev-scale dashboard.
	s.mu.Lock()
	defer s.mu.Unlock()
	bucketsCopy := append([]Bucket(nil), s.buckets...)
	return map[string]interface{}{
		"generatedAt":   time.Now().UTC().Format(time.RFC3339),
		"uptimeSeconds": uptimeSeconds,
		"totals": map[string]int64{
			"received":        s.totalReceived,
			"simulation":      s.totalSimulation,
			"webhook":         s.totalWebhook,
			"errors":          s.totalErrors,
			"backendFailures": s.totalBackendFailures,
		},
		"rates": map[string]interface{}{
			"lastMinuteReceived":        s.lastMinuteReceived,
			"simulationEnabled":         s.simulationEnabled,
			"simulationEmailsPerMinute": s.simulationRate,
			"maxEventsPerMinute":        maxRate,
		},
		"series": map[string]interface{}{
			"perMinute": bucketsCopy,
		},
	}
}

// ResetMinuteCounter clears the rolling last-minute counter.
func (s *Store) ResetMinuteCounter() {
	// Lock s.mu (Store.sync.Mutex): the simulation loop's once-per-minute ticker clears
	// lastMinuteReceived while webhook handlers increment it on every ingest. Without mu,
	// a reset and an increment could race and the "last minute" card would show wrong numbers.
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lastMinuteReceived = 0
}

// touchCurrentBucket appends or updates the bucket for the current UTC minute.
// Caller must already hold s.mu — this helper intentionally does not Lock (double Lock on
// the same sync.Mutex deadlocks the goroutine).
func (s *Store) touchCurrentBucket(update func(*Bucket)) {
	minute := time.Now().UTC().Truncate(time.Minute)
	if len(s.buckets) == 0 || !s.buckets[len(s.buckets)-1].Minute.Equal(minute) {
		s.buckets = append(s.buckets, Bucket{Minute: minute})
		if len(s.buckets) > maxBuckets {
			s.buckets = s.buckets[len(s.buckets)-maxBuckets:]
		}
	}
	update(&s.buckets[len(s.buckets)-1])
}
