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

FROM node:22-bookworm-slim
COPY deploy/install-nginx-debian.sh /tmp/install-nginx-debian.sh
RUN sh /tmp/install-nginx-debian.sh && rm /tmp/install-nginx-debian.sh
ENV NODE_ENV=production PB_NO_TCP=1 PB_WEB_HOST=0.0.0.0 PB_WEB_PORT=8090
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server/package.json server/package-lock.json ./server/
RUN npm --prefix server ci --omit=dev
COPY src ./src
COPY server/src ./server/src
COPY server/runtime ./server/runtime
COPY --from=frontend-build /app/dist ./dist
COPY deploy/kubernetes-nginx.conf ./deploy/kubernetes-nginx.conf
USER node
EXPOSE 8080 8090
CMD ["node", "server/src/main.ts"]
