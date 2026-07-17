FROM node:20-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
EXPOSE 8080
CMD ["node", "src/index.js"]
