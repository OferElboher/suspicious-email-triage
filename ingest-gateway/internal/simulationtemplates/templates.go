// Package simulationtemplates holds rotating phishing demo emails for dev mailbox simulation.
//
// Usage flow:
//  simulation.emitOne → Pick(seq) → CorrelationIDs → backend.EmailPayload
//  → rule_engine sees varied verdicts (phishing vs benign) in the #ingest dashboard
//
// Content mirrors shared/phishing_simulation_templates.json used by Node simulationLoop.js.
package simulationtemplates

import "fmt"

// Template is one synthetic email scenario with expected rule_engine verdict.
type Template struct {
	ID                string
	Label             string
	ExpectedVerdict   string
	SenderName        string
	SenderEmailPrefix string
	Subject           string
	Body              string
}

// All returns the rotating template list (fixed order — round-robin via Pick).
func All() []Template {
	return []Template{
		{
			ID: "url_phishing", Label: "Phishing URL hostname (likely_phishing)", ExpectedVerdict: "likely_phishing",
			SenderName: "IT Security Alert", SenderEmailPrefix: "phish-url",
			Subject: "Action required: verify your account now",
			Body:    "Dear user, your session expired. Open https://secure-login.example-phish.test/login immediately to restore access.",
		},
		{
			ID: "credential_phishing", Label: "Credential harvest keywords (likely_phishing)", ExpectedVerdict: "likely_phishing",
			SenderName: "Billing Support", SenderEmailPrefix: "phish-cred",
			Subject: "Update your password and MFA",
			Body:    "We detected unusual activity. Please verify account credentials and confirm your credit card on file within 24 hours.",
		},
		{
			ID: "urgent_link", Label: "Urgent language + external link (suspicious)", ExpectedVerdict: "suspicious",
			SenderName: "HR Notifications", SenderEmailPrefix: "phish-urgent",
			Subject: "Urgent: policy acknowledgment",
			Body:    "This is urgent — review the updated handbook at http://docs.example.com/handbook before end of day.",
		},
		{
			ID: "benign_newsletter", Label: "Benign newsletter (benign / investigate)", ExpectedVerdict: "benign",
			SenderName: "Team Newsletter", SenderEmailPrefix: "sim-benign",
			Subject: "Weekly team update",
			Body:    "Hello team, here is this week's project summary. No links or sensitive requests in this message.",
		},
	}
}

// Pick selects template by 1-based sequence (round-robin over All()).
//
// Usage: simulation emitOne passes incrementing seq so templates rotate each tick.
func Pick(seq int64) Template {
	list := All()
	if len(list) == 0 {
		return Template{SenderName: "Mailbox Simulator", SenderEmailPrefix: "mailbox-sim", Subject: "Empty", Body: "No templates"}
	}
	idx := int((seq - 1) % int64(len(list)))
	if idx < 0 {
		idx = 0
	}
	return list[idx]
}

// CorrelationIDs builds unique senderEmail and externalMessageId for webhook correlation demos.
//
// Usage: passed into EmailPayload so mock-verdict-callback and Mongo audit show distinct ids per tick.
func CorrelationIDs(t Template, seq int64) (senderEmail, externalMessageID string) {
	prefix := t.SenderEmailPrefix
	if prefix == "" {
		prefix = "mailbox-sim"
	}
	senderEmail = fmt.Sprintf("%s+%d@dev.local", prefix, seq)
	externalMessageID = fmt.Sprintf("dev-sim-%s-%d", t.ID, seq)
	return senderEmail, externalMessageID
}
