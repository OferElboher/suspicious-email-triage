// Package metrics exposes Prometheus counters for the ingest-gateway process.
//
// Technology: prometheus/client_golang — de-facto Go metrics library scraped by Prometheus or Grafana.
package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// ReceivedTotal counts emails accepted by the Node backend after ingest.
	// CounterVec allows a "source" label (mailbox_ingest vs mailbox_simulation).
	ReceivedTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "triage_mailbox_ingest_received_total",
		Help: "Mailbox ingest emails successfully persisted via Node internal API",
	}, []string{"source"})

	// ErrorsTotal counts validation and backend failures at the gateway.
	// promauto registers metrics on init — no manual Register() call needed in main.
	ErrorsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "triage_mailbox_ingest_errors_total",
		Help: "Mailbox ingest failures at the gateway",
	}, []string{"reason"})
)

// RecordSuccess increments Prometheus counters for a successful ingest.
func RecordSuccess(source string) {
	ReceivedTotal.WithLabelValues(source).Inc()
}

// RecordError increments Prometheus error counters.
func RecordError(reason string) {
	ErrorsTotal.WithLabelValues(reason).Inc()
}
