FROM node:22-alpine AS builder
RUN corepack enable pnpm
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/cache/package.json packages/cache/
COPY packages/collectors/base/package.json packages/collectors/base/
COPY packages/collectors/vlr/package.json packages/collectors/vlr/

RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/db/ packages/db/
COPY packages/cache/ packages/cache/
COPY packages/collectors/base/ packages/collectors/base/
COPY packages/collectors/vlr/ packages/collectors/vlr/

RUN pnpm --filter @gametime/shared build \
 && pnpm --filter @gametime/db build \
 && pnpm --filter @gametime/cache build \
 && pnpm --filter @gametime/collector-base build \
 && pnpm --filter @gametime/collector-vlr build

FROM node:22-alpine AS runner
RUN corepack enable pnpm
WORKDIR /app

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/.npmrc ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/ ./packages/shared/
COPY --from=builder /app/packages/db/ ./packages/db/
COPY --from=builder /app/packages/cache/ ./packages/cache/
COPY --from=builder /app/packages/collectors/base/ ./packages/collectors/base/
COPY --from=builder /app/packages/collectors/vlr/ ./packages/collectors/vlr/

WORKDIR /app/packages/collectors/vlr
CMD ["node", "dist/index.js"]
