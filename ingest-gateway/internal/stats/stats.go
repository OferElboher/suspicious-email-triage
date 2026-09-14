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
	// mu is a sync.Mutex (exclusive lock). HTTP handlers and the simulation goroutine
	// update totals, flags, and buckets concurrently — mu serializes those critical sections.
	// Why sync.Mutex: one lock covers int64 fields + []Bucket slice append/truncate together.
	// Why not sync.RWMutex: Snapshot must read totals and buckets as one consistent view;
	//   RLock would still block writers and adds API surface for no gain at dev ingest rates.
	// Why not sync/atomic: cannot atomically update a slice (buckets) with related int64 totals.
	// Why not a channel: no producer/consumer pipeline — just shared mutable counters.
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
	// Acquire s.mu (Store.sync.Mutex): totals + buckets must update together; atomics/channels cannot guard the slice.
	s.mu.Lock()
	defer s.mu.Unlock() // Release s.mu
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
	// Acquire s.mu (Store.sync.Mutex): same critical section as RecordSuccess — no interleaved bucket writes.
	s.mu.Lock()
	defer s.mu.Unlock() // Release s.mu
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
	// Acquire s.mu (Store.sync.Mutex): simulationEnabled and simulationRate are one Snapshot-visible pair.
	s.mu.Lock()
	defer s.mu.Unlock() // Release s.mu
	s.simulationEnabled = enabled
	s.simulationRate = rate
}

// Snapshot returns a JSON-serializable dashboard payload for GET /v1/stats/dashboard.
func (s *Store) Snapshot(maxRate int, uptimeSeconds int64) map[string]interface{} {
	// Acquire s.mu (Store.sync.Mutex): copy buckets under exclusive lock — sync.RWMutex RLock rejected (writers dominate).
	s.mu.Lock()
	defer s.mu.Unlock() // Release s.mu
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
	// Acquire s.mu (Store.sync.Mutex): minute ticker and Record* must not race on lastMinuteReceived.
	s.mu.Lock()
	defer s.mu.Unlock() // Release s.mu
	s.lastMinuteReceived = 0
}

// touchCurrentBucket appends or updates the bucket for the current UTC minute.
// Caller must already hold s.mu — this helper does not Lock (would deadlock sync.Mutex).
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
