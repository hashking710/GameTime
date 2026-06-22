FROM node:22-alpine
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

RUN mkdir -p node_modules/@gametime \
 && ln -sf /app/packages/shared node_modules/@gametime/shared

RUN node node_modules/typescript/bin/tsc -p packages/shared/tsconfig.json \
 && node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json

WORKDIR /app/packages/db
CMD ["node", "--import", "tsx", "dist/migrate.js"]
