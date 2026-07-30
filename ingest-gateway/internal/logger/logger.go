// Package logger appends NDJSON lines to merged.log — same searchable format as Node logger.js.
//
// Pattern: twelve-factor logging — MERGED_LOG_PATH points at the shared Docker volume
// (/var/log/triage/merged.log) so GET /logs/search can filter by service=ingest-gateway.
package logger

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const defaultServiceName = "ingest-gateway"

var (
	mu          sync.Mutex
	serviceName = defaultServiceName
)

func init() {
	// SERVICE_NAME matches Node/Python containers for GET /logs/search?service=…
	if s := os.Getenv("SERVICE_NAME"); s != "" {
		serviceName = s
	}
}

// mergedPath reads MERGED_LOG_PATH on each write so tests can override via t.Setenv.
func mergedPath() string {
	if p := os.Getenv("MERGED_LOG_PATH"); p != "" {
		return p
	}
	return filepath.Join("logs", "merged.log")
}

// SetServiceName overrides the JSON "service" field (tests only).
func SetServiceName(name string) {
	mu.Lock()
	defer mu.Unlock()
	if name != "" {
		serviceName = name
	}
}

// MergedPath returns the active log file path (tests assert append target).
func MergedPath() string {
	return mergedPath()
}

// entry is one NDJSON log record compatible with backend/src/lib/logSearch.js (reserved for doc).
type entry struct {
	Timestamp string `json:"ts"`
	Level     string `json:"level"`
	Topic     string `json:"topic"`
	Message   string `json:"message"`
	Service   string `json:"service"`
}

// writeLine appends one JSON line and mirrors a human-readable line to stdout.
func writeLine(level, topic, message string, meta map[string]interface{}) {
	mu.Lock()
	defer mu.Unlock()

	path := mergedPath()

	if meta == nil {
		meta = map[string]interface{}{}
	}
	payload := map[string]interface{}{
		"ts":      time.Now().UTC().Format(time.RFC3339Nano),
		"level":   level,
		"topic":   topic,
		"message": message,
		"service": serviceName,
	}
	for k, v := range meta {
		payload[k] = v
	}
	line, err := json.Marshal(payload)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ingest-gateway logger marshal failed: %v\n", err)
		return
	}
	line = append(line, '\n')

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "ingest-gateway logger mkdir failed: %v\n", err)
	} else if err := appendFile(path, line); err != nil {
		fmt.Fprintf(os.Stderr, "ingest-gateway logger append failed: %v\n", err)
	}

	// Mirror to stdout for docker compose logs (same as Node/Python logutil).
	fmt.Printf("[%s] [%s] [%s] [%s] %s\n", payload["ts"], level, serviceName, topic, message)
}

// appendFile opens the log file with O_APPEND for concurrent writers on the shared volume.
func appendFile(path string, line []byte) error {
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.Write(line)
	return err
}

// Info logs an informational event (successful ingest, simulation start, etc.).
func Info(topic, message string, meta map[string]interface{}) {
	writeLine("info", topic, message, meta)
}

// Warn logs a recoverable problem (backend slow, simulation advisory failure).
func Warn(topic, message string, meta map[string]interface{}) {
	writeLine("warn", topic, message, meta)
}

// Error logs a failure (validation, backend HTTP error, fatal startup).
func Error(topic, message string, meta map[string]interface{}) {
	writeLine("error", topic, message, meta)
}
