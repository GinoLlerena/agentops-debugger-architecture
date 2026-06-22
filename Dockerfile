# syntax=docker/dockerfile:1
#
# Single-container image for AgentOps Debugger: the API server also serves the
# built web SPA same-origin (WEB_DIST_DIR), so one origin/container hosts the
# whole app — no CORS, no separate front-end host. Runs OFFLINE with zero env
# (seed data, no LLM); pass Alibaba/Qwen env vars to enable live mode.

# ── Build stage: install workspace deps + build shared → api → web ────────────
FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

# Manifests first for better layer caching (deps change less often than source).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Build everything (topological: shared → api → web).
COPY . .
RUN pnpm -r build

# ── Runtime stage: the built workspace (dist + node_modules) ──────────────────
FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    PORT=8787 \
    WEB_DIST_DIR=apps/web/dist
WORKDIR /app

# Copy the fully built workspace. pnpm's symlinked node_modules (incl. the
# .pnpm store) stay valid because the whole tree is copied together. Owned by the
# non-root `node` user (present in the base image) so the container runs unprivileged.
COPY --from=build --chown=node:node /app ./

# Drop root: the server only needs to read the built tree and bind $PORT (>1024).
USER node

EXPOSE 8787
# Liveness: the API reports its mode at /health.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/index.js"]
