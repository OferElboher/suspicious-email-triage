# Mock verdict callback — in-memory webhook receiver for dev verdict delivery demos.
FROM node:18-alpine
WORKDIR /app
COPY infra/mock-verdict-callback/package.json infra/mock-verdict-callback/server.js ./
EXPOSE 4569
CMD ["node", "server.js"]
