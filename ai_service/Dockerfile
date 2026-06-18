FROM python:3.11-slim
WORKDIR /app
ENV PYTHONPATH=/app
COPY ai_service/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
# Copy ai_service code first, then repo scripts (entrypoint lives under scripts/ at repo root).
COPY ai_service/ /app/
COPY scripts /app/scripts
COPY backend/ci.secrets /app/backend/ci.secrets
ENTRYPOINT ["/bin/bash", "/app/scripts/docker-entrypoint-with-secrets.sh"]
