"""Live HTTP checks for API, Django admin, and optional React dev server."""

import requests

from integration_tests.conftest import requires_frontend, requires_stack

API_BASE = "http://127.0.0.1:3000"
ADMIN_BASE = "http://127.0.0.1:8000"
UI_BASE = "http://127.0.0.1:3001"


@requires_stack
def test_api_health():
    """Node API /health must respond when the stack is up."""
    resp = requests.get(f"{API_BASE}/health", timeout=5)
    resp.raise_for_status()
    body = resp.json()
    assert body.get("status") == "ok" or body.get("ok") is True


@requires_stack
def test_django_admin_login_page():
    """Django admin login form must be reachable on port 8000."""
    resp = requests.get(f"{ADMIN_BASE}/admin/login/", timeout=5)
    assert resp.status_code == 200
    assert "Log in" in resp.text or "login" in resp.text.lower()


@requires_stack
def test_django_admin_index_requires_auth():
    """Unauthenticated /admin/ must redirect to login."""
    resp = requests.get(f"{ADMIN_BASE}/admin/", timeout=5, allow_redirects=False)
    assert resp.status_code in (302, 301)
    assert "login" in resp.headers.get("Location", "").lower()


@requires_stack
def test_django_admin_login_page_has_single_accounts_section():
    """Login page must not show legacy contrib.auth section labels."""
    resp = requests.get(f"{ADMIN_BASE}/admin/login/", timeout=5)
    assert resp.status_code == 200
    assert "Authentication and Authorization" not in resp.text


@requires_stack
def test_api_metrics_routes_require_auth():
    """Analytics API routes must reject unauthenticated requests."""
    resp = requests.get(
        f"{API_BASE}/metrics/timeseries?from=2020-01-01T00:00:00.000Z&to=2020-01-02T00:00:00.000Z&bucket=1h",
        timeout=5,
    )
    assert resp.status_code == 401


@requires_frontend
def test_react_triage_shell_loads():
    """CRA dev server must serve the React mount point."""
    resp = requests.get(f"{UI_BASE}/", timeout=8)
    assert resp.status_code == 200
    assert 'id="root"' in resp.text or "Suspicious email triage" in resp.text


@requires_frontend
def test_react_analytics_hash_route_serves_shell():
    """Hash routes still serve the same SPA shell from CRA."""
    resp = requests.get(f"{UI_BASE}/#analytics", timeout=8)
    assert resp.status_code == 200
    assert "root" in resp.text.lower() or "html" in resp.text.lower()
