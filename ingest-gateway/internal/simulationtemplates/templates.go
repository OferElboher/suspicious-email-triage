// Package simulationtemplates holds rotating phishing demo emails for dev mailbox simulation.
//
// Pattern: mirrors shared/phishing_simulation_templates.json used by Node simulationLoop.js
// so Go and Node demos exercise the same rule_engine scenarios.
package simulationtemplates

import "fmt"

// Template is one synthetic email scenario (URL phish, credential phish, urgent link, benign).
type Template struct {
	ID                string
	Label             string
	ExpectedVerdict   string
	SenderName        string
	SenderEmailPrefix string
	Subject           string
	Body              string
}

// All returns the rotating template list (order matches shared JSON).
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

// Pick selects template by 1-based sequence (round-robin).
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

// CorrelationIDs builds sender email and externalMessageId for webhook correlation demos.
func CorrelationIDs(t Template, seq int64) (senderEmail, externalMessageID string) {
	prefix := t.SenderEmailPrefix
	if prefix == "" {
		prefix = "mailbox-sim"
	}
	senderEmail = fmt.Sprintf("%s+%d@dev.local", prefix, seq)
	externalMessageID = fmt.Sprintf("dev-sim-%s-%d", t.ID, seq)
	return senderEmail, externalMessageID
}
