FROM oven/bun:1.2.22 AS builder

WORKDIR /app

# Install frontend dependencies first for better layer caching
COPY bun.lock ./bun.lock
COPY frontend/package.json ./frontend/package.json
WORKDIR /app/frontend
RUN bun install

# Build frontend
COPY frontend ./
RUN bun run build

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
