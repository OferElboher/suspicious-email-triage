// Package metrics exposes Prometheus counters for the ingest-gateway process.
//
// Usage flow:
//  handler/simulation call RecordSuccess/RecordError → CounterVec.Inc()
//  → GET /metrics (promhttp) → Prometheus or Grafana scrapes triage_mailbox_ingest_* counters
package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// ReceivedTotal counts emails Node accepted after ingest (label: source = mailbox_ingest | mailbox_simulation).
	ReceivedTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "triage_mailbox_ingest_received_total",
		Help: "Mailbox ingest emails successfully persisted via Node internal API",
	}, []string{"source"})

	// ErrorsTotal counts gateway-side failures (label: reason = invalid_json | validation | backend | simulation).
	ErrorsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "triage_mailbox_ingest_errors_total",
		Help: "Mailbox ingest failures at the gateway",
	}, []string{"reason"})
)

// RecordSuccess increments Prometheus counters after a successful Node persist.
func RecordSuccess(source string) {
	ReceivedTotal.WithLabelValues(source).Inc()
}

// RecordError increments Prometheus error counters with a reason label.
func RecordError(reason string) {
	ErrorsTotal.WithLabelValues(reason).Inc()
}
