#!/usr/bin/env bash
# verify-campaign-detection: run unit tests that prove campaign detection logic and mock LLM rules.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/backend"
echo "Running campaign detection Jest tests..."
npm test -- --testPathPattern=campaignDetection --watchAll=false
echo "Running mock LLM phishing campaign pytest..."
cd "$ROOT"
python -m pytest ai_service/tests/test_mock_phishing_campaign.py -q
echo "Campaign detection verification passed."
