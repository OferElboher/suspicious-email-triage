"""Repository guardrails — always run on pre-push (no Docker required)."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_pytest_ini_excludes_legacy_django_tests():
    """pytest.ini must not collect backend/core Django tests (Poetry env only)."""
    ini = (ROOT / "pytest.ini").read_text(encoding="utf-8")
    assert "integration_tests" in ini
    assert "ai_service/tests" in ini
    assert "norecursedirs" in ini and "backend" in ini


def test_django_admin_uses_sqlite_router():
    """django-admin must not migrate contrib.auth into Postgres."""
    settings = (ROOT / "backend/triage_auth/django_admin_settings.py").read_text(encoding="utf-8")
    assert "DATABASE_ROUTERS" in settings
    assert "sqlite3" in settings


def test_django_admin_unregisters_contrib_auth_models():
    """apps.py disables last_login update and hides duplicate User/Group admin entries."""
    apps = (ROOT / "backend/triage_auth/apps.py").read_text(encoding="utf-8")
    assert "unregister" in apps
    assert "update_last_login" in apps


def test_test_all_invokes_pytest_with_root_config():
    """test-all.sh delegates Python coverage to pytest.ini paths."""
    script = (ROOT / "scripts/test-all.sh").read_text(encoding="utf-8")
    assert "pytest" in script
    ini = (ROOT / "pytest.ini").read_text(encoding="utf-8")
    assert "ai_service/tests" in ini
    assert "integration_tests" in ini


def test_junction_models_use_composite_primary_key():
    """auth_user_roles has no id column — models must declare CompositePrimaryKey."""
    models_src = (ROOT / "backend/triage_auth/models.py").read_text(encoding="utf-8")
    assert "class TriageUserRole" in models_src
    assert "CompositePrimaryKey" in models_src
    assert 'CompositePrimaryKey("user", "role")' in models_src
    assert "class TriageRolePermission" in models_src
    assert 'CompositePrimaryKey("role", "permission")' in models_src


def test_user_admin_avoids_composite_pk_inlines():
    """
    Django admin inlines POST composite PKs as '(2, 1)' but CompositePrimaryKey expects JSON.

    User roles must be edited via the main form multi-select, not TabularInline.
    """
    admin_src = (ROOT / "backend/triage_auth/admin.py").read_text(encoding="utf-8")
    assert "TriageUserRoleInline" not in admin_src
    assert "class TriageUserRoleInline" not in admin_src
    assert "inlines = [" not in admin_src
    assert "_sync_user_roles" in admin_src
    assert "ModelMultipleChoiceField" in admin_src


def test_triage_admin_disables_sqlite_audit_log():
    """
    LogEntry.user_id FK targets SQLite auth_user; signed-in admins are TriageUser rows in Postgres.

    Saving audit rows caused IntegrityError on password update — mixin must no-op log_* methods.
    """
    admin_src = (ROOT / "backend/triage_auth/admin.py").read_text(encoding="utf-8")
    logging_src = (ROOT / "backend/triage_auth/admin_logging.py").read_text(encoding="utf-8")
    assert "TriageAdminLoggingMixin" in admin_src
    assert "class TriageAdminLoggingMixin" in logging_src
    assert "def log_change" in logging_src
    assert "TriageUserAdmin(TriageAdminLoggingMixin" in admin_src


def test_forgot_password_email_does_not_throw_on_smtp_failure():
    """sendPasswordResetEmail must catch delivery errors — forgot-password stays HTTP 200."""
    email_src = (ROOT / "backend/src/auth/email.js").read_text(encoding="utf-8")
    auth_src = (ROOT / "backend/src/api/auth.js").read_text(encoding="utf-8")
    assert "google_oauth" in email_src
    assert "gmailApi" in email_src
    assert "catch (err)" in email_src or "catch (err)" in email_src
    assert "delivered: false" in email_src
    assert "/google/start" in auth_src


def test_llm_provider_mock_commercial_wired():
    """LLM_PROVIDER=mock_commercial must be implemented in Python and Node workers."""
    py_client = (ROOT / "ai_service/app/llm_client.py").read_text(encoding="utf-8")
    node_provider = (ROOT / "backend/src/llm/llmProvider.js").read_text(encoding="utf-8")
    assert "mock_commercial" in py_client
    assert "mock_commercial" in node_provider
    assert (ROOT / "ai_service/mock_commercial_llm/server.py").is_file()


def test_neo4j_graph_module_wired():
    """Neo4j phishing graph must ship driver, sync, API routes, and Celery callback."""
    compose = (ROOT / "infra/docker/docker-compose.yml").read_text(encoding="utf-8")
    assert "neo4j:" in compose
    assert (ROOT / "backend/src/graph/syncReview.js").is_file()
    assert (ROOT / "backend/src/api/graph.js").is_file()
    assert (ROOT / "backend/src/api/graphInternal.js").is_file()
    assert (ROOT / "ai_service/app/graph_sync.py").is_file()
    constants = (ROOT / "backend/src/auth/constants.js").read_text(encoding="utf-8")
    assert "graph.read" in constants
    create_app = (ROOT / "backend/src/http/createApp.js").read_text(encoding="utf-8")
    assert "/graph/internal" in create_app
    tasks = (ROOT / "ai_service/app/tasks.py").read_text(encoding="utf-8")
    assert "sync_review_graph" in tasks


def test_neo4j_setup_and_demo_docs_exist():
    """WSL/Windows setup and hands-on demo guides must be indexed from docs/README.md."""
    readme = (ROOT / "docs/README.md").read_text(encoding="utf-8")
    assert (ROOT / "docs/tech_neo4j_setup_wsl_windows.md").is_file()
    assert (ROOT / "docs/graph_demo_neo4j_phishing.md").is_file()
    assert "tech_neo4j_setup_wsl_windows.md" in readme
    assert "graph_demo_neo4j_phishing.md" in readme
    setup = (ROOT / "docs/tech_neo4j_setup_wsl_windows.md").read_text(encoding="utf-8")
    assert "NEO4J_PASSWORD" in setup
    assert "3000" in setup and "3001" in setup
    assert "GRAPH_INTERNAL_TOKEN" in setup
    assert "invalid_token" in setup
    assert "triage-neo4j-dev" not in setup
    assert "dev-graph-sync-token" not in setup


def test_curl_graph_api_script_documents_ports():
    """Helper script must target API port 3000 and warn about JWT vs internal token."""
    script = (ROOT / "scripts/curl-graph-api.sh").read_text(encoding="utf-8")
    assert "localhost:3000" in script
    assert "3001" in script
    assert "GRAPH_INTERNAL_TOKEN" in script


def test_ci_workflow_uses_node24_for_actions():
    """GitHub Actions must use checkout v5+ and validate settings without Node backend image."""
    ci = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
    assert "actions/checkout@v5" in ci
    assert "django-admin" in ci
    assert "lint-all.sh" in ci
    assert "test-all.sh" in ci
    assert "python backend/scripts/check_settings.py" in ci
    assert "backend \\\n            python backend/scripts/check_settings.py" not in ci


def test_check_settings_bootstraps_python_path():
    """check_settings.py must import triage_auth when run standalone in CI."""
    src = (ROOT / "backend/scripts/check_settings.py").read_text(encoding="utf-8")
    assert "sys.path.insert" in src
    assert "triage_auth" in src or "_BACKEND_DIR" in src


def test_neo4j_client_converts_limit_integers():
    """Neo4j LIMIT rejects JS floats — driver params must use neo4j.int."""
    src = (ROOT / "backend/src/graph/neo4jClient.js").read_text(encoding="utf-8")
    assert "toNeo4jParams" in src
    assert "neo4j.int" in src


def test_tbd_roadmap_doc_indexed():
    """Production roadmap doc must be linked from docs/README.md."""
    readme = (ROOT / "docs/README.md").read_text(encoding="utf-8")
    assert (ROOT / "docs/roadmap_tbd.md").is_file()
    assert "roadmap_tbd.md" in readme


def test_health_ops_and_helm_wired():
    """Health probes, ops metrics, Helm chart, and theme preferences must exist."""
    create_app = (ROOT / "backend/src/http/createApp.js").read_text(encoding="utf-8")
    assert "/health" in create_app
    assert "/ops" in create_app
    assert (ROOT / "backend/src/api/health.js").is_file()
    assert (ROOT / "backend/src/api/ops.js").is_file()
    assert (ROOT / "backend/src/lib/healthChecks.js").is_file()
    assert (ROOT / "backend/src/lib/appMetrics.js").is_file()
    compose = (ROOT / "infra/docker/docker-compose.yml").read_text(encoding="utf-8")
    assert "healthcheck:" in compose
    assert "/health/ready" in compose
    assert "postgres-data:" in compose
    assert "mongo-data:" in compose
    assert (ROOT / "deploy/helm/triage/Chart.yaml").is_file()
    assert (ROOT / "deploy/helm/triage/values-dev.yaml").is_file()
    auth = (ROOT / "backend/src/api/auth.js").read_text(encoding="utf-8")
    assert "/preferences" in auth
    assert (ROOT / "frontend/src/context/ThemeContext.jsx").is_file()
    assert (ROOT / "frontend/src/styles/themes.css").is_file()
    assert (ROOT / "frontend/src/setupProxy.js").is_file()
    assert "elasticsearch:" in compose
    assert (ROOT / "backend/src/api/search.js").is_file()
    assert (ROOT / "backend/src/search/elasticClient.js").is_file()


def test_observability_and_api_docs_indexed():
    readme = (ROOT / "docs/README.md").read_text(encoding="utf-8")
    for name in (
        "ops_guide_kubernetes_helm.md",
        "api_reference_rest.md",
        "ops_guide_health_uptime.md",
        "ops_guide_central_logging.md",
        "ops_guide_metrics_alerting.md",
        "ui_guide_color_themes.md",
        "search_guide_elasticsearch_reviews.md",
        "tech_neo4j_browser_guide.md",
    ):
        assert (ROOT / f"docs/{name}").is_file()
        assert name in readme


def test_each_doc_has_runnable_cli_sample():
    """Every guide under docs/ must include at least one ```bash block (self-contained samples)."""
    skip = {"util_terminal_block_format.md"}
    for path in sorted((ROOT / "docs").glob("*.md")):
        if path.name in skip:
            continue
        text = path.read_text(encoding="utf-8")
        assert "```bash" in text, f"{path.name} must include a ```bash command sample"


def test_docs_readme_indexes_all_guides():
    """Every docs/*.md (except README and util_*) must appear in docs/README.md."""
    readme = (ROOT / "docs/README.md").read_text(encoding="utf-8")
    skip = {"README.md", "util_terminal_block_format.md"}
    for path in sorted((ROOT / "docs").glob("*.md")):
        if path.name in skip:
            continue
        assert path.name in readme, f"{path.name} missing from docs/README.md"


def test_frontend_env_does_not_set_api_url_for_dev():
    """frontend/.env must not set REACT_APP_API_URL=http://localhost:3000 (breaks CRA proxy login)."""
    env = (ROOT / "frontend/.env").read_text(encoding="utf-8")
    assert "REACT_APP_API_URL=http://localhost:3000" not in env


def test_dev_login_uses_cra_proxy_in_development():
    """Regression: REACT_APP_API_URL must not bypass setupProxy in development."""
    src = (ROOT / "frontend/src/lib/apiBase.js").read_text(encoding="utf-8")
    assert 'process.env.NODE_ENV === "development"' in src
    assert 'return ""' in src
