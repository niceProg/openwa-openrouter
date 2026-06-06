# Backend gateway WhatsApp (Express + whatsapp-web.js).
# Pakai Chromium sistem (bukan unduhan puppeteer) agar image lebih kecil & andal.
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=2785 \
    DATA_DIR=/app/data

WORKDIR /app

# Install dependency dulu (cache layer), lalu salin sumber.
COPY backend/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY backend/ ./
RUN mkdir -p /app/data

EXPOSE 2785
CMD ["node", "server.js"]
