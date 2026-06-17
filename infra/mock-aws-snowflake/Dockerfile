# Mock AWS Snowflake — in-memory analytics API for dev (no real cloud warehouse).
FROM node:18-alpine
WORKDIR /app
COPY infra/mock-aws-snowflake/package.json infra/mock-aws-snowflake/server.js ./
EXPOSE 4567
CMD ["node", "server.js"]
