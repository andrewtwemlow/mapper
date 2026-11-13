# syntax=docker/dockerfile:1

# ── Stage 1: Build ────────────────────────────────────────────────────────────
# Builds the Rust wasm crate and the Vite frontend, producing a static dist/.
FROM rust:1.99-slim AS builder

# Install Node.js (LTS) and wasm-pack build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install wasm-pack
RUN curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# Add the wasm32 target
RUN rustup target add wasm32-unknown-unknown

WORKDIR /workspace

# ── Copy and build the Rust crate ─────────────────────────────────────────────
COPY crate/ crate/
RUN wasm-pack build crate/ --target web --out-dir ../app/src/wasm-pkg --release

# ── Copy and build the frontend ───────────────────────────────────────────────
# Copy only the source files needed to build — excludes dist/, node_modules/,
# and src/wasm-pkg/ which are either generated in this stage or in the Rust
# stage above.
COPY app/package.json app/package-lock.json app/
COPY app/index.html app/vite.config.ts app/tsconfig.json app/eslint.config.js app/.prettierrc.json app/
COPY app/src/ app/src/
COPY app/public/ app/public/
RUN cd app && npm ci && npm run build

# ── Stage 2: Serve ────────────────────────────────────────────────────────────
# Serves the static build output with nginx.
FROM nginx:1.29-alpine AS server

# Remove default nginx content
RUN rm -rf /usr/share/nginx/html/*

# Copy the Vite build output
COPY --from=builder /workspace/app/dist/ /usr/share/nginx/html/

# nginx config: serve SPA with clean 404 fallback to index.html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
