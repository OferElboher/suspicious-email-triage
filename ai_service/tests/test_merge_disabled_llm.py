"""merge_results must keep rule_engine verdict when LLM is disabled (DISABLE_LLM stub)."""

from app.merge import merge_results
from app.rule_engine import run_rule_engine


def test_disabled_llm_stub_does_not_force_benign():
    """Regression: graph demo reviews need rule_engine suspicious verdict when LLM is off."""
    rules = run_rule_engine(
        {
            "subject": "locked",
            "body": "Click: https://secure-login.example-phish.test/update",
            "senderEmail": "a@other.test",
        }
    )
    llm_stub = {
        "_llmDisabled": True,
        "summary": "LLM disabled (python stub)",
        "findings": [],
        "followUpQuestions": [],
    }
    merged = merge_results(rules, llm_stub)
    assert merged["verdict"] in ("suspicious", "likely_phishing")
    assert merged["verdict"] != "benign"
