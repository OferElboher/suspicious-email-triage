from app.rule_engine import run_rule_engine


def test_password_triggers_phishing():
    v, a, f, _ = run_rule_engine(
        {
            "subject": "verify",
            "body": "please send your password",
            "senderEmail": "x@evil.com",
        }
    )
    assert v == "likely_phishing"
    assert a == "report_and_block"
    assert f


def test_benign_empty_findings_get_followups():
    v, a, f, fu = run_rule_engine(
        {
            "subject": "hello",
            "body": "meeting notes attached",
            "senderEmail": "a@b.com",
        }
    )
    assert v == "benign"
    assert not f
    assert fu
