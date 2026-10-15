---
inclusion: always
---

# GPX Mapper v2 — Project Steering

## Overview

A purely client-side WebAssembly application that lets users upload GPX, FIT (.fit / .fit.gz), and TCX (.tcx / .tcx.gz) activity files, renders all tracks on an interactive map, and provides download links for:

1. A **combined GPX file** — each uploaded track as its own `<trk>` element.
2. A **self-contained HTML map document** — references external CDN resources (Leaflet JS/CSS, CartoDB tiles) but embeds all track data inline so it can be shared as a single file.

There is no backend. All file parsing and processing happens in the browser via WebAssembly compiled from Rust.

## Repository Layout (root-level monorepo)

```
/
├── crate/                  # Rust wasm-pack crate (file parsing, GPX generation)
│   ├── src/
│   │   └── lib.rs
│   └── Cargo.toml
├── app/                    # TypeScript + Vite frontend
│   ├── src/
│   │   ├── main.ts
│   │   ├── map.ts          # Leaflet map initialisation and track rendering
│   │   ├── ui.ts           # File upload UI, colour picker, download links
│   │   └── wasm.ts         # Wasm module loader / thin wrapper
│   ├── public/
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── tests/
│   ├── unit/               # Vitest unit tests (JS/TS logic)
│   └── e2e/                # Playwright end-to-end tests
├── test-data/              # Shared sample files for tests
│   ├── *.gpx
│   ├── *.fit.gz
│   └── *.tcx.gz
├── Dockerfile
├── mise.toml
├── .pre-commit-config.yaml
└── README.md
```

## Technology Stack

| Layer | Choice | Version |
|---|---|---|
| File parsing / processing | Rust compiled to Wasm via wasm-pack | wasm-pack 0.15 |
| Frontend build | Vite | 8.x |
| Frontend language | TypeScript | strict mode |
| Map rendering | Leaflet.js (CDN) | latest stable |
| Map tiles | CartoDB (public, no API key required) | — |
| Unit tests | Vitest | 4.x |
| E2E tests | Playwright | latest |
| Runtime tooling | mise | — |
| Containerisation | Docker (nginx serving static build output) | — |

## Supported File Formats

- **GPX** — `.gpx`
- **FIT** — `.fit`, `.fit.gz`
- **TCX** — `.tcx`, `.tcx.gz`

All parsing is done in the Rust crate; the JS layer only passes raw `ArrayBuffer` / `Uint8Array` bytes to Wasm.

## Map Tile Styles (user-selectable)

Users can switch between CartoDB tile styles at runtime:

- `CartoDB.DarkMatter` (default)
- `CartoDB.DarkMatterNoLabels`
- `CartoDB.Positron`
- `CartoDB.Voyager`

## Track Colours

- Default palette: 10 colours cycling in upload order (same palette as v1: `#1f77b4`, `#ff7f0e`, `#2ca02c`, `#d62728`, `#6d20b6`, `#8c564b`, `#e377c2`, `#7f7f7f`, `#bcbd22`, `#17becf`).
- Each track has a colour picker in the UI so the user can override per-track.

## Combined GPX Output Format

Each uploaded track becomes its own `<trk>` element with a `<name>` child set to the original filename stem. All tracks are wrapped in a single GPX 1.1 document with namespace `http://www.topografix.com/GPX/1/1`.

## Output HTML Map Format

- References Leaflet JS + CSS from CDN.
- CartoDB tile URLs are embedded as configuration.
- All track coordinate data is serialised as a JSON blob inside a `<script>` tag.
- The file is fully self-contained for data but requires network access for tiles.

## Browser Targets

Latest stable Chrome and Firefox only. No IE, no Safari requirement.

## Deployment

Docker container running nginx to serve the Vite production build (`app/dist/`). Must also be deployable as a plain static site (S3 / CDN) without changes — build output is pure static files.

## Coding Standards

See `coding-standards.md` for language-specific rules.

## Testing Requirements

See `testing.md` for full test strategy and Playwright setup.
