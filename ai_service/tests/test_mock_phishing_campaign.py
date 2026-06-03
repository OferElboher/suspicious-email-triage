"""Tests that mock LLM flags demo phishing URLs as likely_phishing (campaign demo path)."""

from mock_commercial_llm.responses import pick_mock_analysis


def test_example_phish_domain_triggers_likely_phishing():
    """Demo guide URLs with example-phish.test must produce a risky verdict."""
    text = (
        "Sender: a@b.com\n"
        "Subject: Account notice\n"
        "Body: Click https://secure-login.example-phish.test/update\n"
    )
    result = pick_mock_analysis(text, "gpt-mock", 0.2)
    assert result["verdict"] == "likely_phishing"


def test_account_locked_subject_triggers_suspicious():
    """Second demo email without cred keywords still gets suspicious verdict."""
    text = (
        "Sender: b@c.com\n"
        "Subject: Your account will be locked\n"
        "Body: Click here: https://secure-login.example-phish.test/x\n"
    )
    result = pick_mock_analysis(text, "gpt-mock", 0.2)
    assert result["verdict"] in ("suspicious", "likely_phishing")
