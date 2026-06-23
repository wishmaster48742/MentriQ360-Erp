FROM node:22-alpine AS deps

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY web/package.json ./web/package.json
RUN pnpm install --filter mentriq360-web --frozen-lockfile

FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/pnpm-lock.yaml ./
COPY --from=deps /app/pnpm-workspace.yaml ./
COPY --from=deps /app/package.json ./
COPY --from=deps /app/web/node_modules ./web/node_modules
COPY package.json pnpm-workspace.yaml ./
COPY web ./web

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DOCKER_BUILD=true

RUN pnpm --dir web build

FROM node:22-alpine AS runner

WORKDIR /app/web

RUN addgroup --system nodejs --gid 1001 && \
    adduser --system nextjs --uid 1001 --ingroup nodejs && \
    chown -R nextjs:nodejs /app

COPY --from=builder /app/web/public ./public
COPY --from=builder /app/web/.next/standalone ./
COPY --from=builder /app/web/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
