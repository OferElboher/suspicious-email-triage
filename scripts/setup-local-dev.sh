#!/usr/bin/env bash
# setup-local-dev: check and install local tools/dependencies for the dev stack.

set -euo pipefail

# ROOT: absolute repository path, so the script can be started from anywhere.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --help: prints usage without checking or installing anything.
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: bash scripts/setup-local-dev.sh"
  echo "Checks/installs Docker, Compose, Node, npm, Python, curl, jq, project libraries, and ai_service/.venv."
  exit 0
fi

# APT_UPDATED: avoids running apt-get update more than once.
APT_UPDATED=0

# can_use_apt: true when apt-get is available on this machine.
can_use_apt() {
  command -v apt-get >/dev/null 2>&1
}

# run_sudo: uses sudo when not already root.
run_sudo() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

# apt_update_once: refreshes package metadata only before the first apt install.
apt_update_once() {
  if [[ "$APT_UPDATED" -eq 0 ]]; then
    run_sudo apt-get update
    APT_UPDATED=1
  fi
}

# install_apt_package: installs one apt package when apt is available.
install_apt_package() {
  local package_name="$1"
  if ! can_use_apt; then
    echo "apt-get is unavailable; please install ${package_name} manually."
    return 0
  fi
  apt_update_once
  run_sudo apt-get install -y "$package_name"
}

# ensure_command: checks for a command and installs a related apt package if missing.
ensure_command() {
  local command_name="$1"
  local package_name="$2"
  if command -v "$command_name" >/dev/null 2>&1; then
    echo "${command_name} already installed: $("$command_name" --version 2>/dev/null | head -n 1)"
  else
    echo "${command_name} missing; installing ${package_name} when possible."
    install_apt_package "$package_name"
  fi
}

# Docker is used for local MongoDB, PostgreSQL, Redis, Redpanda, and services.
ensure_command docker docker.io

# Docker Compose plugin is checked separately because it may come from Docker Desktop.
if docker compose version >/dev/null 2>&1; then
  echo "docker compose already installed: $(docker compose version)"
else
  echo "docker compose plugin missing; installing docker-compose-plugin when possible."
  install_apt_package docker-compose-plugin
fi

# Node/npm run backend scripts and the React development server.
ensure_command node nodejs
ensure_command npm npm

# Python runs ai_service and optional Django checks; packages live in ai_service/.venv.
ensure_command python3 python3
if python3 -c "import venv" >/dev/null 2>&1; then
  echo "python3 venv module already available"
else
  echo "python3 venv module missing; installing python3-venv when possible."
  install_apt_package python3-venv
fi

# curl/jq are used by documented health checks and reset/simulation examples.
ensure_command curl curl
ensure_command jq jq

# Root tooling includes Husky hooks.
npm install --prefix "$ROOT"

# Backend libraries include Express, MongoDB/Mongoose, KafkaJS, Redis, and pg.
npm install --prefix "$ROOT/backend"

# Frontend libraries include React and Recharts.
npm install --prefix "$ROOT/frontend"

# Python libraries include Celery, Kafka client, PyMongo, requests, psycopg, and pytest.
# PEP 668 blocks system-wide pip on modern Debian/Ubuntu; use a project venv instead.
# shellcheck source=/dev/null
source "$ROOT/scripts/ensure-ai-service-venv.sh"
ensure_ai_service_venv "$ROOT" >/dev/null
echo "Python ai_service dependencies ready in ai_service/.venv"

echo "Local dev setup checks completed."
