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
//
// Usage: Info/Warn/Error delegate here with level, topic, message, and optional meta map.
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
