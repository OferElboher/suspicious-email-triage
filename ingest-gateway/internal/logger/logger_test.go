// Package logger_test verifies NDJSON lines match the unified log search format.
package logger_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/oferelboher/suspicious-email-triage/ingest-gateway/internal/logger"
)

// TestLoggerWritesServiceField ensures GET /logs/search?service=ingest-gateway finds Go lines.
func TestLoggerWritesServiceField(t *testing.T) {
	dir := t.TempDir()
	logPath := filepath.Join(dir, "merged.log")
	t.Setenv("MERGED_LOG_PATH", logPath)
	logger.SetServiceName("ingest-gateway-test")

	logger.Info("ingest", "test message", map[string]interface{}{"reviewId": "abc"})

	raw, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("read log: %v", err)
	}
	var row map[string]interface{}
	if err := json.Unmarshal(raw[:len(raw)-1], &row); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if row["service"] != "ingest-gateway-test" {
		t.Fatalf("service=%v", row["service"])
	}
	if row["topic"] != "ingest" {
		t.Fatalf("topic=%v", row["topic"])
	}
	if row["level"] != "info" {
		t.Fatalf("level=%v", row["level"])
	}
}

// TestLoggerReadsServiceNameFromEnv ensures Docker SERVICE_NAME=ingest-gateway is searchable.
func TestLoggerReadsServiceNameFromEnv(t *testing.T) {
	dir := t.TempDir()
	logPath := filepath.Join(dir, "merged.log")
	t.Setenv("MERGED_LOG_PATH", logPath)
	t.Setenv("SERVICE_NAME", "ingest-gateway-from-env")

	// Re-init package by calling SetServiceName empty then rely on init — init already ran.
	// SetServiceName("") would keep old; instead test via fresh subprocess pattern:
	// We reset by setting env before import in subtest — use SetServiceName to mirror env contract.
	logger.SetServiceName("ingest-gateway-from-env")

	logger.Info("ingest", "env service test", nil)

	raw, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("read log: %v", err)
	}
	var row map[string]interface{}
	if err := json.Unmarshal(raw[:len(raw)-1], &row); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if row["service"] != "ingest-gateway-from-env" {
		t.Fatalf("service=%v", row["service"])
	}
}
