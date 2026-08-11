FROM node:20-slim

# Install curl for optional healthcheck fallback if needed
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy source code and directories
COPY emulator.js server.js vadlightrunner.js copy-extensions.js ./
COPY utils ./utils
COPY public ./public
COPY extensions ./extensions

# Environment variables
ENV PORT=7860
ENV NODE_ENV=production
ENV EXTENSIONS_DIR=/app/extensions

# Healthcheck endpoint verification
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 7860) + '/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Ensure data directory exists and set permissions for non-root execution
RUN mkdir -p /app/data && chown -R 1000:1000 /app

USER 1000

EXPOSE 7860 10000 80

CMD ["node", "server.js"]
