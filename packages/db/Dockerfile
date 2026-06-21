FROM node:20-alpine
RUN corepack enable pnpm
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/

RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/db/ packages/db/

RUN pnpm --filter @gametime/shared build \
 && pnpm --filter @gametime/db build

WORKDIR /app/packages/db
CMD ["npx", "tsx", "src/migrate.ts"]
