FROM python:3.11-slim
WORKDIR /app
ENV PYTHONPATH=/app
COPY ai_service/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY scripts /app/scripts
COPY ai_service/ /app/
COPY backend/ci.secrets /app/backend/ci.secrets
