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
	mu sync.Mutex // protects all fields — dev-scale concurrency; not sharded

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
//
// Usage: called from handleIngestEmail (webhook) and emitOne (simulation=true).
func (s *Store) RecordSuccess(source string, simulation bool) {
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
//
// Usage: backendFailure=true when Node returned non-2xx or connection failed.
func (s *Store) RecordError(backendFailure bool) {
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
//
// Usage: simulation.Start/Stop call this when toggling the background goroutine.
func (s *Store) SetSimulationState(enabled bool, rate int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.simulationEnabled = enabled
	s.simulationRate = rate
}

// Snapshot returns a JSON-serializable dashboard payload for GET /v1/stats/dashboard.
//
// Usage: handleDashboard passes uptime from API.startedAt; Node proxy forwards to React.
func (s *Store) Snapshot(maxRate int, uptimeSeconds int64) map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()
	bucketsCopy := append([]Bucket(nil), s.buckets...) // defensive copy for concurrent serialization
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
//
// Usage: simulation loop's minuteReset ticker calls this for the "Last minute" stat card.
func (s *Store) ResetMinuteCounter() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lastMinuteReceived = 0
}

// touchCurrentBucket appends or updates the bucket for the current UTC minute.
//
// Usage: internal helper — callers hold mu via RecordSuccess/RecordError.
// Ring buffer: when len(buckets) > maxBuckets, drop oldest minute.
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
