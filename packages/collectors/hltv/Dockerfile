FROM node:22-alpine AS builder
RUN corepack enable pnpm
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/cache/package.json packages/cache/
COPY packages/bot/package.json packages/bot/
COPY packages/collectors/base/package.json packages/collectors/base/
COPY packages/collectors/hltv/package.json packages/collectors/hltv/
COPY packages/collectors/vlr/package.json packages/collectors/vlr/
COPY packages/collectors/riot/package.json packages/collectors/riot/
COPY packages/collectors/opendota/package.json packages/collectors/opendota/
COPY packages/collectors/sportsdb/package.json packages/collectors/sportsdb/
COPY packages/collectors/odds/package.json packages/collectors/odds/
COPY packages/reminder/package.json packages/reminder/

RUN pnpm install

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/db/ packages/db/
COPY packages/cache/ packages/cache/
COPY packages/collectors/base/ packages/collectors/base/
COPY packages/collectors/hltv/ packages/collectors/hltv/

RUN mkdir -p node_modules/@gametime \
 && ln -sf /app/packages/shared node_modules/@gametime/shared \
 && ln -sf /app/packages/db node_modules/@gametime/db \
 && ln -sf /app/packages/cache node_modules/@gametime/cache \
 && ln -sf /app/packages/collectors/base node_modules/@gametime/collector-base

RUN node node_modules/typescript/bin/tsc -p packages/shared/tsconfig.json \
 && node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json \
 && node node_modules/typescript/bin/tsc -p packages/cache/tsconfig.json \
 && node node_modules/typescript/bin/tsc -p packages/collectors/base/tsconfig.json \
 && node node_modules/typescript/bin/tsc -p packages/collectors/hltv/tsconfig.json

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/cache/dist ./packages/cache/dist
COPY --from=builder /app/packages/cache/package.json ./packages/cache/
COPY --from=builder /app/packages/collectors/base/dist ./packages/collectors/base/dist
COPY --from=builder /app/packages/collectors/base/package.json ./packages/collectors/base/
COPY --from=builder /app/packages/collectors/hltv/dist ./packages/collectors/hltv/dist
COPY --from=builder /app/packages/collectors/hltv/package.json ./packages/collectors/hltv/
RUN mkdir -p node_modules/@gametime \
 && ln -sf /app/packages/shared node_modules/@gametime/shared \
 && ln -sf /app/packages/db node_modules/@gametime/db \
 && ln -sf /app/packages/cache node_modules/@gametime/cache \
 && ln -sf /app/packages/collectors/base node_modules/@gametime/collector-base
WORKDIR /app/packages/collectors/hltv
CMD ["node", "--import", "tsx", "dist/index.js"]
