// Package stats tracks in-memory counters and a rolling time series for the ingest dashboard.
//
// Pattern: atomic counters for Prometheus + mutex-protected ring buffer for UI sparklines.
// Technology: sync/atomic for hot paths; no external TSDB required in dev.
package stats

import (
	"sync"
	"time"
)

const maxBuckets = 60

// Bucket is one minute of ingest activity for frontend charts.
type Bucket struct {
	Minute            time.Time `json:"minute"`
	Received          int64     `json:"received"`
	Simulation        int64     `json:"simulation"`
	Webhook           int64     `json:"webhook"`
	Errors            int64     `json:"errors"`
	BackendFailures   int64     `json:"backendFailures"`
}

// Store aggregates gateway usage for GET /v1/stats/dashboard.
type Store struct {
	mu sync.Mutex

	totalReceived        int64
	totalSimulation      int64
	totalWebhook         int64
	totalErrors          int64
	totalBackendFailures int64
	lastMinuteReceived   int64
	buckets              []Bucket
	simulationEnabled    bool
	simulationRate       int
}

// NewStore constructs an empty statistics store.
func NewStore() *Store {
	return &Store{buckets: make([]Bucket, 0, maxBuckets)}
}

// RecordSuccess increments counters after a review was accepted by the Node backend.
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

// RecordError increments failure counters (validation, backend HTTP errors, etc.).
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

// SetSimulationState updates simulation metadata shown in the dashboard.
func (s *Store) SetSimulationState(enabled bool, rate int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.simulationEnabled = enabled
	s.simulationRate = rate
}

// Snapshot returns a JSON-serializable dashboard payload.
func (s *Store) Snapshot(maxRate int, uptimeSeconds int64) map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()
	bucketsCopy := append([]Bucket(nil), s.buckets...)
	return map[string]interface{}{
		"generatedAt": time.Now().UTC().Format(time.RFC3339),
		"uptimeSeconds": uptimeSeconds,
		"totals": map[string]int64{
			"received":        s.totalReceived,
			"simulation":      s.totalSimulation,
			"webhook":         s.totalWebhook,
			"errors":          s.totalErrors,
			"backendFailures": s.totalBackendFailures,
		},
		"rates": map[string]interface{}{
			"lastMinuteReceived": s.lastMinuteReceived,
			"simulationEnabled": s.simulationEnabled,
			"simulationEmailsPerMinute": s.simulationRate,
			"maxEventsPerMinute": maxRate,
		},
		"series": map[string]interface{}{
			"perMinute": bucketsCopy,
		},
	}
}

// ResetMinuteCounter clears the rolling last-minute counter (called by simulation ticker housekeeping).
func (s *Store) ResetMinuteCounter() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lastMinuteReceived = 0
}

// touchCurrentBucket appends or updates the bucket for the current UTC minute.
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
