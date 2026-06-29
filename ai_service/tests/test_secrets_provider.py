"""Unit tests for the Python secrets-provider abstraction (mock AWS + file fallback)."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.secrets_provider import (
    load_application_secrets,
    load_secrets_from_file,
    parse_secrets_text,
    secret_bundle_id,
)

ROOT = Path(__file__).resolve().parents[2]
CI_SECRETS = ROOT / "backend" / "ci.secrets"


def test_parse_secrets_text_skips_comments():
    """Dotenv-style parser must ignore # comments and blank lines."""
    parsed = parse_secrets_text("# hi\nJWT_SECRET=abc\n\nPOSTGRES_PASSWORD=p\n")
    assert parsed["JWT_SECRET"] == "abc"
    assert parsed["POSTGRES_PASSWORD"] == "p"


def test_load_secrets_from_ci_file_uses_fake_credentials_only():
    """CI bundle must contain fake prefixes — never real production secrets."""
    secrets = load_secrets_from_file(CI_SECRETS)
    assert "ci-fake" in secrets["JWT_SECRET"]
    assert secrets["POSTGRES_PASSWORD"].startswith("ci-fake")


def test_load_application_secrets_file_provider(monkeypatch):
    """SECRETS_PROVIDER=file reads backend/ci.secrets in unit tests."""
    monkeypatch.setenv("SECRETS_PROVIDER", "file")
    monkeypatch.setenv("SECRETS_FILE", str(CI_SECRETS))
    for key in ("JWT_SECRET", "POSTGRES_PASSWORD"):
        monkeypatch.delenv(key, raising=False)
    loaded = load_application_secrets()
    assert loaded["JWT_SECRET"]
    assert os.environ["JWT_SECRET"] == loaded["JWT_SECRET"]
    monkeypatch.delenv("POSTGRES_PASSWORD", raising=False)


def test_secret_bundle_id_default():
    """Default AWS secret id follows triage/{env} naming convention."""
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.delenv("SECRETS_BUNDLE_ID", raising=False)
    monkeypatch.setenv("DEPLOYMENT_ENV", "dev")
    assert secret_bundle_id() == "triage/dev"
    monkeypatch.undo()


def test_load_application_secrets_aws_provider(monkeypatch):
    """SECRETS_PROVIDER=aws routes to load_secrets_from_aws (staging/prod path)."""
    import app.secrets_provider as sp

    monkeypatch.setenv("SECRETS_PROVIDER", "aws")
    monkeypatch.setattr(
        sp,
        "load_secrets_from_aws",
        lambda: {"JWT_SECRET": "from-aws", "POSTGRES_PASSWORD": "p"},
    )
    monkeypatch.delenv("JWT_SECRET", raising=False)
    loaded = load_application_secrets()
    assert loaded["JWT_SECRET"] == "from-aws"
