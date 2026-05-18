###############################################################################
# Suspicious Email Triage - Backend Container
#
# PURPOSE:
# This Dockerfile builds the Express API service responsible for:
# - receiving review creation requests (/reviews, /test)
# - persisting data into MongoDB
# - enqueuing background jobs into Redis (BullMQ)
#
# ARCHITECTURE ROLE:
#
#   API Layer (this container)
#        ↓
#   MongoDB (storage)
#        ↓
#   Redis (queue)
#        ↓
#   Worker container (async processing)
#
# DESIGN PRINCIPLES:
# - stateless API service
# - lightweight container for fast startup
# - dependency isolation via package.json install
###############################################################################

# Base image: official Node.js runtime
FROM node:18

###############################################################################
# Working directory inside container
# All subsequent commands execute relative to /app
###############################################################################
WORKDIR /app/backend

###############################################################################
# Dependency installation layer (Docker caching optimization)
#
# CONCEPT: Docker Layer Caching
#
# Docker builds images in layers. Each instruction creates a cached layer.
# If a layer does not change, Docker reuses it instead of rebuilding it.
#
# WHY THIS ORDER MATTERS:
#
# If we copied the full source code BEFORE installing dependencies:
#
#   COPY . .
#   RUN npm install
#
# then ANY code change would invalidate the cache and force:
# - full dependency reinstall
# - slower builds
#
# OPTIMIZED APPROACH (USED HERE):
#
#   1. COPY only dependency files:
#      - package.json
#      - package-lock.json
#
#   2. RUN npm install (cached layer)
#
#   3. COPY application source code
#
# RESULT:
# - npm install runs only when dependencies change
# - normal code changes do NOT trigger reinstall
# - significantly faster development iteration cycles
#
# IMPACT IN THIS PROJECT:
# - faster backend rebuilds during debugging
# - faster worker iteration cycles
# - improved developer experience in Docker environment
###############################################################################
COPY backend/package*.json ./
RUN npm install

###############################################################################
# Copy application source & shared code into container
###############################################################################
COPY shared ../shared
COPY backend/ .

###############################################################################
# Expose backend API port
# This must match Express app.listen(PORT)
###############################################################################
EXPOSE 3000

###############################################################################
# Start command
# Runs the Express API server
###############################################################################
CMD ["node", "src/server.js"]