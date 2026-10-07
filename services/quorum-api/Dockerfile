FROM node:22-slim AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY brand/package.json brand/package.json
COPY packages/quorum-contracts/package.json packages/quorum-contracts/package.json
COPY services/quorum-api/package.json services/quorum-api/package.json
RUN npm ci --workspace @politeia/quorum-contracts --workspace @politeia/quorum-api
COPY packages/quorum-contracts packages/quorum-contracts
COPY services/quorum-api services/quorum-api
RUN npm run build --workspace @politeia/quorum-contracts && npm run build --workspace @politeia/quorum-api

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY brand/package.json brand/package.json
COPY packages/quorum-contracts/package.json packages/quorum-contracts/package.json
COPY services/quorum-api/package.json services/quorum-api/package.json
RUN npm ci --omit=dev --workspace @politeia/quorum-contracts --workspace @politeia/quorum-api
COPY --from=build /workspace/packages/quorum-contracts/dist packages/quorum-contracts/dist
COPY --from=build /workspace/services/quorum-api/dist services/quorum-api/dist
CMD ["node", "services/quorum-api/dist/index.js"]
