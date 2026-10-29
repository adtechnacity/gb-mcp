# Container image for the hosted deployment behind ContextForge
# (contextforge-atn, ECS service "growthbook-mcp"). Built by CodeBuild via
# buildspec.yml and pushed to ECR as contextforge-growthbook-mcp.
#
# Base images come from the AWS-hosted public ECR mirror of Docker Hub library
# images to avoid Docker Hub's anonymous rate limit on shared CodeBuild egress
# IPs. They are byte-identical to docker.io/library/node:22-slim.

# ── Build: compile src/ -> server/ ──────────────────────────────────────────
FROM public.ecr.aws/docker/library/node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ── Runtime ─────────────────────────────────────────────────────────────────
FROM public.ecr.aws/docker/library/node:22-slim

# The server only speaks stdio, so supergateway bridges it to streamable-HTTP.
# Pinned because upstream is unmaintained (3.4.3 is the last release, Oct 2025)
# and we patch its dist below.
ARG SUPERGATEWAY_VERSION=3.4.3
RUN npm install -g "supergateway@${SUPERGATEWAY_VERSION}"

# supergateway calls the async transport.send() without awaiting it or attaching
# a .catch(). When ContextForge's health check times out and closes the session
# before the stdio child replies, send() rejects with "No connection established
# for request ID: N"; the sync try/catch around it cannot catch an async
# rejection, so Node 22 treats it as a fatal unhandled rejection and kills PID 1
# -- which cycled the task ~800 times/day. Attach the missing .catch(). The grep
# guards against the patch silently not applying if the pinned version changes.
RUN SG=/usr/local/lib/node_modules/supergateway/dist/gateways/stdioToStatefulStreamableHttp.js \
 && grep -q '^                            transport.send(jsonMsg);$' "$SG" \
 && sed -i 's|^                            transport.send(jsonMsg);$|                            transport.send(jsonMsg).catch((e) => logger.error(`Failed to send to StreamableHttp`, e));|' "$SG" \
 && grep -q 'transport.send(jsonMsg).catch(' "$SG"

WORKDIR /app
# package.json is read at runtime (server/index.js imports ../package.json).
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server

EXPOSE 8000

# Stateful streamable-HTTP (not SSE) is required: supergateway's stdio->SSE
# bridge shares a single MCP Server and never disconnects it when a client
# drops, so the next reconnect throws "Already connected to a transport" and
# the process exits. Stateful streamable-HTTP creates a fresh server + stdio
# child per session (keyed by mcp-session-id) and tears them down on
# disconnect, so ContextForge reconnects cleanly.
CMD ["supergateway", \
     "--stdio", "node /app/server/index.js", \
     "--outputTransport", "streamableHttp", "--stateful", \
     "--port", "8000", "--streamableHttpPath", "/mcp"]
