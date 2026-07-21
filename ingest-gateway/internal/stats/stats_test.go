// Package stats_test contains unit tests for the in-memory ingest statistics store.
package stats_test

import (
	"testing"

	"github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/stats"
)

// TestStoreRecordSuccess verifies counters increment for webhook vs simulation paths.
func TestStoreRecordSuccess(t *testing.T) {
	store := stats.NewStore()
	store.RecordSuccess("webhook", false)
	store.RecordSuccess("simulation", true)
	snap := store.Snapshot(30, 10)
	totals := snap["totals"].(map[string]int64)
	if totals["received"] != 2 {
		t.Fatalf("expected 2 received, got %d", totals["received"])
	}
	if totals["simulation"] != 1 || totals["webhook"] != 1 {
		t.Fatalf("unexpected channel split: %+v", totals)
	}
}

// TestStoreRecordError tracks backend failure separately from validation errors.
func TestStoreRecordError(t *testing.T) {
	store := stats.NewStore()
	store.RecordError(true)
	snap := store.Snapshot(30, 5)
	totals := snap["totals"].(map[string]int64)
	if totals["errors"] != 1 || totals["backendFailures"] != 1 {
		t.Fatalf("unexpected error totals: %+v", totals)
	}
}
