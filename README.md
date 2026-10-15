# GPX Mapper v2

A purely client-side WebAssembly application for uploading, visualising, and exporting GPS activity files.

Upload GPX, FIT (.fit / .fit.gz), or TCX (.tcx / .tcx.gz) files. All processing happens in the browser — no data is sent to a server.

**Features:**

- Drag-and-drop or click-to-upload multiple files
- Interactive map with user-selectable CartoDB tile styles
- Per-track colour picker (10-colour default palette)
- Download a combined GPX file (one `<trk>` per uploaded file)
- Download a shareable HTML map (self-contained data, CDN assets)

---

## Prerequisites

All tooling is managed via [mise](https://mise.jdx.dev/).

```bash
# Install mise (if not already installed)
curl https://mise.run | sh

# Install all project tools
mise install
```

This installs: **Node.js 22**, **Rust (stable)**, **pre-commit**, **gh**.

wasm-pack is installed separately via cargo (mise does not provide it):

```bash
cargo install wasm-pack
```

---

## Development

All common workflows are available as mise tasks. Run `mise tasks` to list them all.

### Start the dev server

```bash
mise run dev
```

This compiles the Rust crate to Wasm, installs npm dependencies, and starts the Vite dev server at `http://localhost:5173`. Hot-reload is active for TypeScript/CSS changes; re-run `mise run wasm` after any Rust changes.

### Install pre-commit hooks (once)

```bash
pre-commit install
pre-commit install --hook-type commit-msg
```

---

## Testing

```bash
# Rust unit tests
mise run test-rust

# JS/TS unit tests (Vitest)
mise run test-unit

# Both together
mise run test

# End-to-end tests (Playwright) — requires a prior build
mise run build
mise run test-e2e
```

---

## Production build

```bash
mise run build
```

Compiles Wasm with `--release` optimisations, then builds the frontend. Output lands in `app/dist/` — a plain static site deployable anywhere.

Preview the production build locally:

```bash
mise run preview
```

Open `http://localhost:4173`.

---

## Docker

```bash
# Build image and run on port 8080
mise run docker

# Or as separate steps
mise run docker-build
mise run docker-run
```

Open `http://localhost:8080`.

---

## All available tasks

| Task | Description |
| --- | --- |
| `mise run dev` | Build Wasm (dev) + start Vite dev server |
| `mise run build` | Build Wasm (release) + build frontend for production |
| `mise run preview` | Production build + Vite preview server |
| `mise run wasm` | Compile Rust crate to Wasm (dev) |
| `mise run wasm-release` | Compile Rust crate to Wasm (release) |
| `mise run install` | Install frontend npm dependencies |
| `mise run test` | Run Rust + JS/TS unit tests |
| `mise run test-rust` | Run Rust unit tests only |
| `mise run test-unit` | Run Vitest unit tests only |
| `mise run test-e2e` | Run Playwright E2E tests |
| `mise run lint` | ESLint on TypeScript source |
| `mise run audit` | Check npm dependencies for vulnerabilities |
| `mise run check` | Fast pre-build: `cargo check` (wasm32) + `npm audit` |
| `mise run check-rust` | `cargo check` for wasm32 target only |
| `mise run format` | Prettier formatting |
| `mise run typecheck` | TypeScript type-check without emitting |
| `mise run docker` | Build Docker image and run on port 8080 |
| `mise run docker-build` | Build Docker image only |
| `mise run docker-run` | Run the Docker container on port 8080 |

---

## Project Structure

```
crate/          Rust wasm-pack crate (file parsing, GPX/HTML generation)
app/            TypeScript + Vite frontend
tests/
  unit/         Vitest unit tests
  e2e/          Playwright end-to-end tests
test-data/      Sample GPX, FIT, and TCX files used by tests
.kiro/
  steering/     Project requirements and coding standards
  hooks/        Kiro automation hooks
```

---

## Architecture

All file parsing (GPX, FIT, TCX) and output generation (combined GPX, HTML map) is implemented in Rust and compiled to WebAssembly via wasm-pack. The TypeScript frontend loads the Wasm module, passes raw file bytes to it, and handles map rendering via Leaflet.js.

See `.kiro/steering/project.md` for full requirements and design decisions.
