FROM node:20-alpine AS builder
RUN corepack enable pnpm
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/cache/package.json packages/cache/
COPY packages/collectors/base/package.json packages/collectors/base/
COPY packages/collectors/odds/package.json packages/collectors/odds/

RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/db/ packages/db/
COPY packages/cache/ packages/cache/
COPY packages/collectors/base/ packages/collectors/base/
COPY packages/collectors/odds/ packages/collectors/odds/

RUN pnpm --filter @gametime/shared build \
 && pnpm --filter @gametime/db build \
 && pnpm --filter @gametime/cache build \
 && pnpm --filter @gametime/collector-base build \
 && pnpm --filter @gametime/collector-odds build

FROM node:20-alpine AS runner
RUN corepack enable pnpm
WORKDIR /app

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/.npmrc ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/ ./packages/shared/
COPY --from=builder /app/packages/db/ ./packages/db/
COPY --from=builder /app/packages/cache/ ./packages/cache/
COPY --from=builder /app/packages/collectors/base/ ./packages/collectors/base/
COPY --from=builder /app/packages/collectors/odds/ ./packages/collectors/odds/

WORKDIR /app/packages/collectors/odds
CMD ["node", "dist/index.js"]
