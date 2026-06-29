"""
Python secrets-provider — mirrors Node secretsProvider.js for Celery/Kafka workers.

Pattern: SECRETS_PROVIDER=mock-aws (dev Docker) or aws (staging/prod IAM) at process start.
Technology: urllib mock HTTP for dev; boto3 GetSecretValue for real AWS Secrets Manager.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Dict

# Repository root when running in Docker (/app) or locally (parent of ai_service).
REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"


def _deployment_env() -> str:
    """Return dev/staging/prod/ci slice from DEPLOYMENT_ENV or APP_ENV."""
    return (os.getenv("DEPLOYMENT_ENV") or os.getenv("APP_ENV") or "dev").lower()


def _secrets_file_path() -> Path:
    """Resolve gitignored *.secrets path for the active deployment slice."""
    explicit = os.getenv("SECRETS_FILE")
    if explicit:
        return Path(explicit).resolve()
    return BACKEND_DIR / f"{_deployment_env()}.secrets"


def parse_secrets_text(raw: str) -> Dict[str, str]:
    """Parse dotenv-style KEY=VALUE lines (no shell expansion)."""
    out: Dict[str, str] = {}
    for line in raw.splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#"):
            continue
        if "=" not in trimmed:
            continue
        key, value = trimmed.split("=", 1)
        key = key.strip()
        if key:
            out[key] = value.strip()
    return out


def load_secrets_from_file(path: Path | None = None) -> Dict[str, str]:
    """Read secrets directly from a gitignored *.secrets file."""
    target = path or _secrets_file_path()
    if not target.is_file():
        return {}
    return parse_secrets_text(target.read_text(encoding="utf-8"))


def secret_bundle_id() -> str:
    """AWS-style secret name, e.g. triage/dev."""
    return os.getenv("SECRETS_BUNDLE_ID") or f"triage/{_deployment_env()}"


def load_secrets_from_mock_aws() -> Dict[str, str]:
    """HTTP GET to mock AWS Secrets Manager (GetSecretValue-compatible JSON)."""
    base = (os.getenv("SECRETS_MANAGER_URL") or "http://mock-secrets-manager:4566").rstrip("/")
    secret_id = secret_bundle_id()
    url = f"{base}/v1/secrets/{urllib.parse.quote(secret_id, safe='')}"

    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            body = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError) as err:
        raise RuntimeError(f"mock AWS Secrets Manager unreachable at {url}: {err}") from err

    secret_string = body.get("SecretString") or ""
    if isinstance(secret_string, str) and secret_string.strip().startswith("{"):
        try:
            parsed = json.loads(secret_string)
            return {str(k): str(v) for k, v in parsed.items()}
        except json.JSONDecodeError:
            pass
    return parse_secrets_text(str(secret_string))


def load_secrets_from_aws() -> Dict[str, str]:
    """Fetch secret bundle from real AWS Secrets Manager (boto3 + IAM role or env keys)."""
    import boto3
    from botocore.exceptions import ClientError

    region = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-east-1"
    secret_id = secret_bundle_id()
    client = boto3.client("secretsmanager", region_name=region)
    try:
        response = client.get_secret_value(SecretId=secret_id)
    except ClientError as err:
        raise RuntimeError(
            "AWS Secrets Manager get_secret_value failed for "
            f"secretId={secret_id} region={region}: {err}"
        ) from err

    secret_string = response.get("SecretString") or ""
    if isinstance(secret_string, str) and secret_string.strip().startswith("{"):
        try:
            parsed = json.loads(secret_string)
            return {str(k): str(v) for k, v in parsed.items()}
        except json.JSONDecodeError:
            pass
    return parse_secrets_text(str(secret_string))


def load_application_secrets() -> Dict[str, str]:
    """Load secrets using SECRETS_PROVIDER and merge into os.environ."""
    provider = (os.getenv("SECRETS_PROVIDER") or "mock-aws").lower()

    if provider == "file":
        secrets = load_secrets_from_file()
    elif provider == "mock-aws":
        try:
            secrets = load_secrets_from_mock_aws()
        except RuntimeError:
            secrets = load_secrets_from_file()
            if not secrets:
                raise
    elif provider == "aws":
        secrets = load_secrets_from_aws()
    else:
        raise ValueError(f"Unsupported SECRETS_PROVIDER={provider}")

    for key, value in secrets.items():
        os.environ[key] = value
    return secrets


def inject_secrets_into_environ() -> str:
    """
    Shell-export lines for docker-entrypoint-with-secrets.sh (eval-friendly).
    Returns empty string when no secrets loaded.
    """
    secrets = load_application_secrets()
    lines = []
    for key, value in secrets.items():
        # Single-quote escape for bash eval safety.
        safe = value.replace("'", "'\\''")
        lines.append(f"export {key}='{safe}'")
    return "\n".join(lines)
