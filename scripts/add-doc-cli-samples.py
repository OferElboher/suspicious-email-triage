#!/usr/bin/env python3
"""Append a runnable terminal sample to docs that lack ```bash blocks."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"

SECTION = """
---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — WSL, repository root unless noted</p>

```bash
{command}
```

</div>
"""

SAMPLES: dict[str, str] = {
    "README.md": "cd ~/suspicious-email-triage\nbash scripts/test-all.sh",
    "arch_assignment_historical.md": "cd ~/suspicious-email-triage\nbash scripts/test-all.sh",
    "arch_guide_overview.md": (
        "cd ~/suspicious-email-triage\n"
        "DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml "
        "up -d backend mongo postgres redis ai-celery ai-kafka-dispatch"
    ),
    "arch_guide_system_comprehensive.md": (
        "cd ~/suspicious-email-triage\n"
        "DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d"
    ),
    "arch_guide_worker_pipeline.md": (
        "cd ~/suspicious-email-triage\n"
        "DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml "
        "logs -f --tail=50 ai-celery ai-kafka-dispatch"
    ),
    "biz_guide_user.md": (
        "cd ~/suspicious-email-triage\n"
        "PORT=3001 npm start --prefix frontend\n"
        "# Open http://localhost:3001 and sign in"
    ),
    "ci_guide_node_python_django_legacy.md": "cd ~/suspicious-email-triage\nbash scripts/lint-all.sh",
    "ci_guide_pipeline_architecture.md": "cd ~/suspicious-email-triage\nbash scripts/test-all.sh",
    "roadmap_implemented_beyond_requirements.md": "cd ~/suspicious-email-triage\nbash scripts/test-all.sh",
    "roadmap_tbd.md": "cd ~/suspicious-email-triage\nbash scripts/lint-all.sh",
    "tech_cursor_project_rules.md": "cd ~/suspicious-email-triage\ncat .cursorrules | head -40",
    "tech_env_configuration.md": (
        "cd ~/suspicious-email-triage/backend\n"
        "DEPLOYMENT_ENV=dev node -e "
        "\"const r=require('./src/config/runtime'); "
        "console.log('deployment', process.env.DEPLOYMENT_ENV || 'dev');\""
    ),
    "tech_neo4j_browser_guide.md": (
        "cd ~/suspicious-email-triage\n"
        "DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d neo4j\n"
        "# Then open http://localhost:7474/browser/ in your Windows browser"
    ),
    "ui_guide_analytics_charts.md": (
        "cd ~/suspicious-email-triage\n"
        "curl -sS http://localhost:3000/health/live\n"
        "# API must be up; open charts at http://localhost:3001/#analytics after sign-in"
    ),
}


def main() -> None:
    for name, command in SAMPLES.items():
        path = DOCS / name
        if not path.is_file():
            print(f"skip missing {name}")
            continue
        text = path.read_text(encoding="utf-8")
        if "```bash" in text or "{#run-one-command}" in text:
            print(f"skip already has bash: {name}")
            continue
        block = SECTION.replace("{command}", command)
        path.write_text(text.rstrip() + block + "\n", encoding="utf-8")
        print(f"updated {name}")


if __name__ == "__main__":
    main()
