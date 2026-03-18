FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

ENV DEBIAN_FRONTEND=noninteractive
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    jq \
    sqlite3 \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /workspaces/request-bot
