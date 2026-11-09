# syntax=docker/dockerfile:1.7
FROM node:24-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
ENV SITE_ADDRESS=:80
EXPOSE 80 443 443/udp
VOLUME ["/data", "/config"]
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:2019/config/ >/dev/null || exit 1
