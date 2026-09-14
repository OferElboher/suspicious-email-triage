// Package logger appends NDJSON lines to merged.log — same searchable format as Node logger.js.
//
// Usage flow:
//  handler/simulation/main call Info/Warn/Error → writeLine → append merged.log + stdout
//  → Node GET /logs/search?service=ingest-gateway finds these lines in the shared Docker volume
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
	// mu is a package-level sync.Mutex — Go's built-in exclusive lock for shared package state.
	// Lock() means "only one goroutine may run writeLine or SetServiceName at a time."
	// In Go there is no lighter-weight Lock type; sync.Mutex is the normal choice for this pattern.
	//
	// Why any lock is required: HTTP handlers and the simulation goroutine call Info/Warn/Error
	// concurrently. Each call JSON-marshals a payload and writes bytes to merged.log. Without mu,
	// two goroutines could interleave bytes in the middle of a line, producing invalid NDJSON that
	// breaks GET /logs/search.
	//
	// Why sync.Mutex and not sync.RWMutex: every log call writes to the file. A read/write lock
	// helps when many readers and few writers coexist; here every operation is a write, so
	// RWMutex would never grant concurrent access anyway.
	//
	// Why not a channel plus a background writer goroutine: that pattern serializes log lines too,
	// but adds goroutine lifecycle, shutdown handling, and buffered memory. Log volume in this
	// service is low; a direct Mutex around the write is simpler and easier to reason about.
	//
	// Why not sync/atomic only on serviceName: writeLine also writes to the file and reads
	// serviceName while building the payload — the race is on the whole write path, not one string.
	//
	// Note: os.O_APPEND helps when multiple processes append, but two goroutines in this process
	// can still corrupt a single line without mu — Append mode does not make Write atomic.
	mu          sync.Mutex
	serviceName = defaultServiceName
)

func init() {
	if s := os.Getenv("SERVICE_NAME"); s != "" {
		serviceName = s
	}
}

// mergedPath returns MERGED_LOG_PATH or default logs/merged.log (re-read each write for tests).
func mergedPath() string {
	if p := os.Getenv("MERGED_LOG_PATH"); p != "" {
		return p
	}
	return filepath.Join("logs", "merged.log")
}

// SetServiceName overrides the JSON "service" field (tests only).
func SetServiceName(name string) {
	// Lock mu (package sync.Mutex): tests change serviceName while writeLine reads it when building
	// the JSON "service" field. Without the lock, Go's race detector would flag a data race and
	// the log line could contain a torn or mixed service name string.
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

// writeLine appends one NDJSON record and mirrors a human-readable line to stdout.
func writeLine(level, topic, message string, meta map[string]interface{}) {
	// Lock mu (package sync.Mutex): hold for the full marshal-then-write sequence so another
	// goroutine cannot insert bytes between our JSON object and the trailing newline. This is
	// an exclusive Mutex lock, not RWMutex — there is no read-only fast path because we always
	// append. A finer-grained "file lock" API does not exist in the Go standard library for this.
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
	fmt.Printf("[%s] [%s] [%s] [%s] %s\n", payload["ts"], level, serviceName, topic, message)
}

// appendFile opens the log file with O_APPEND for concurrent writers on the shared volume.
// Must only be called while mu (sync.Mutex) is already locked in writeLine — calling appendFile
// without holding mu would allow two goroutines to open/write/close concurrently and corrupt NDJSON.
func appendFile(path string, line []byte) error {
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.Write(line)
	return err
}

// Info logs a normal operational event (successful ingest, simulation start, server listening).
func Info(topic, message string, meta map[string]interface{}) {
	writeLine("info", topic, message, meta)
}

// Warn logs a recoverable problem (validation failure, simulation emit retry advisory).
func Warn(topic, message string, meta map[string]interface{}) {
	writeLine("warn", topic, message, meta)
}

// Error logs a failure worth investigating (Node backend down, fatal startup error).
func Error(topic, message string, meta map[string]interface{}) {
	writeLine("error", topic, message, meta)
}
