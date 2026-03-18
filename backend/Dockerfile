FROM mcr.microsoft.com/playwright:v1.58.2-noble

ENV DEBIAN_FRONTEND=noninteractive
ENV BUN_INSTALL=/root/.bun
ENV PATH=/root/.bun/bin:$PATH

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates unzip \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash

WORKDIR /app

# Install backend dependencies first for better layer caching
COPY bun.lock ./bun.lock
COPY backend/package.json ./backend/package.json
WORKDIR /app/backend
RUN bun install

# Copy backend source
COPY backend ./

EXPOSE 8000

CMD ["bun", "run", "index.ts"]
