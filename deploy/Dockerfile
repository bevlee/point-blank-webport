FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY server/package.json server/package-lock.json ./server/
RUN npm --prefix server ci
COPY . .

FROM dependencies AS frontend-build
ARG VITE_RELAY_ONLY=0
RUN npm run build:prod

FROM nginx:1.31.9-alpine AS frontend
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/dist /usr/share/nginx/html
# Converted game assets are mounted separately at /game-assets, never included in the image.

FROM node:22-bookworm-slim AS backend
ENV NODE_ENV=production PB_NO_TCP=1 PB_WEB_HOST=0.0.0.0 PB_WEB_PORT=8090
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server/package.json server/package-lock.json ./server/
RUN npm --prefix server ci --omit=dev
COPY src ./src
COPY server/src ./server/src
COPY server/runtime ./server/runtime
USER node
EXPOSE 8090
CMD ["node", "server/src/main.ts"]

# Separate target for real WebRTC tests on Linux, including relay-only verification.
FROM dependencies AS verification
CMD ["npm", "run", "test:p2p"]
