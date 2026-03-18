# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# VITE_ prefixed vars are embedded into the frontend bundle at build time
ARG VITE_ONESIGNAL_APP_ID
ENV VITE_ONESIGNAL_APP_ID=$VITE_ONESIGNAL_APP_ID

RUN npm run build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled server and frontend assets
COPY --from=builder /app/dist ./dist

# Required for auto-migration on startup
COPY migrations ./migrations

# The app listens on port 5000 — Railway reads PORT to route traffic
ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

CMD ["node", "dist/index.js"]
