"""Rule engine flags demo phishing URL hosts (aligned with mock_commercial_llm)."""

from app.rule_engine import run_rule_engine


def test_example_phish_host_is_likely_phishing():
    verdict, action, findings, _ = run_rule_engine(
        {
            "subject": "Account",
            "body": "Link: https://secure-login.example-phish.test/path",
            "senderEmail": "x@y.test",
        }
    )
    assert verdict == "likely_phishing"
    assert action == "report_and_block"
    assert findings
