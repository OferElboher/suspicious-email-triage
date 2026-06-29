# Mock Amazon S3 — in-memory object storage for dev backups (staging/prod use real S3).
FROM node:18-alpine
WORKDIR /app
COPY infra/mock-aws-s3/package.json infra/mock-aws-s3/server.js ./
EXPOSE 4568
CMD ["node", "server.js"]
