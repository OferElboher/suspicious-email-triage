# Mock AWS Secrets Manager — serves gitignored *.secrets files over HTTP at container start.
FROM node:18-alpine
WORKDIR /app
COPY infra/mock-aws-secrets-manager/package.json infra/mock-aws-secrets-manager/server.js ./
EXPOSE 4566
CMD ["node", "server.js"]
