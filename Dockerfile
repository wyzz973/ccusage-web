# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build --workspace=web
RUN npm run build --workspace=server

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/web/dist ./server/dist/public
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
# Image ships a known-good ccusage; runtime updater refreshes it on a schedule.
RUN npm install -g ccusage@latest
ENV PORT=47821
EXPOSE 47821
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:47821/api/health > /dev/null || exit 1
CMD ["node", "server/dist/index.js"]
