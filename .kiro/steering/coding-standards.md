---
inclusion: always
---

# Coding Standards

## General

- All public functions, types, modules, and constants **must** have documentation comments.
- No dead code. Unused imports, variables, and functions are errors.
- Follow the principle of least surprise: names should describe what a function does, not how it does it.
- No magic numbers — use named constants.
- Errors must be handled explicitly; do not silently swallow them.

## Rust (crate/)

### Style

- Follow the official [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/).
- Format with `rustfmt` (enforced by pre-commit hook).
- Lint with `clippy --deny warnings` (enforced by pre-commit hook).
- Edition: 2021.
- **Run `cargo check` after writing or modifying any Rust file.** Do not present Rust code as complete until `cargo check` passes. This catches borrow errors, type errors, and syntax issues (including raw string delimiter mistakes) before the full wasm-pack build.

### Raw string literals

- Raw strings containing `#` characters (e.g. hex colour values, CSS, HTML) **must** use at least `r##"..."##` delimiters. Using `r#"..."#` when the string body contains `#` will silently terminate the literal early, causing cryptic compile errors.
- Rule of thumb: count the `#` chars needed so no `"#` sequence inside the string matches the closing delimiter. When in doubt, use `r##`.

### Borrow checker and temporaries

- Never call `.as_ref()` (or any borrow method) on a temporary in the same expression where the reference is used beyond that statement. Bind to a `let` first:

  ```rust
  // ❌ Temporary dropped before borrow is used
  let name = local_name(e.name().as_ref());

  // ✅ Temporary lives for the whole block
  let name_bytes = e.name();
  let name = local_name(name_bytes.as_ref());
  ```

- This pattern is especially common with `quick-xml` event names and any method returning an owned value that is immediately borrowed.

### Wasm / wasm-bindgen

- All public Wasm exports must be annotated with `#[wasm_bindgen]`.
- Errors crossing the Wasm boundary must be returned as `Result<T, JsValue>` so callers can catch them in JS.
- Use `wasm_bindgen::JsError` (or `JsValue::from(e.to_string())`) for error propagation — never panic across the Wasm boundary.
- Keep the public API surface minimal: expose only what the JS layer needs.

### Error handling

- Use `thiserror` for typed domain errors inside the crate.
- Convert to `JsValue` at the Wasm boundary only.

### Testing

- Unit tests live in `crate/src/` as `#[cfg(test)]` modules.
- Integration tests that require a browser runtime go in `tests/unit/` via Vitest + `@vitest/browser`.

### Documentation

- Every public `fn`, `struct`, `enum`, and `mod` gets a `///` doc comment.
- `lib.rs` must have a module-level `//!` comment describing the crate purpose.

## TypeScript (app/)

### Style

- Strict TypeScript (`"strict": true` in tsconfig).
- No `any` — use `unknown` and narrow, or define proper types.
- ESLint with `@typescript-eslint/recommended` (enforced by pre-commit hook).
- Prettier for formatting (enforced by pre-commit hook).
- Use `const` by default; `let` only when reassignment is necessary.

### npm dependencies

- Pin all dependencies to exact versions (no `^` or `~` ranges) so builds are reproducible.
- **Run `npm audit` immediately after any `npm install`.** Do not use a dependency that has known high or critical severity vulnerabilities. If the audit reports vulnerabilities, update to a fixed version before proceeding.
- When pinning a new package version, verify the version exists on npm and is not in a known vulnerable range for that package.

### ES module compatibility

- All TypeScript files use `"type": "module"` — never use CommonJS-only globals.
- **Never use `__dirname` or `__filename`** — these are not defined in ES modules. Use `path.dirname(fileURLToPath(import.meta.url))` instead:

  ```typescript
  import { fileURLToPath } from "url";
  import path from "path";
  // import.meta.url is the file path itself — dirname gets the containing folder
  const DIR = path.dirname(fileURLToPath(import.meta.url));
  const DATA = path.resolve(DIR, "../../test-data");
  ```

  **Common mistake:** `path.resolve(fileURLToPath(import.meta.url), "../..")` resolves relative to the *file*, not its directory — the first `..` strips the filename, giving unexpected results. Always call `path.dirname()` first.

### Module conventions

- Each file has a single clear responsibility (see repo layout in `project.md`).
- Prefer named exports over default exports.
- Import Wasm functions only through `src/wasm.ts` — no direct imports of the generated pkg elsewhere.

### Error handling

- Wasm calls must be wrapped in try/catch; errors must surface to the user via the UI (not just the console).
- File parsing failures for individual files must not abort the whole batch — report the error per-file and continue.

### Documentation

- All exported functions and types must have JSDoc comments.
- Non-obvious logic blocks get inline comments.

## HTML / CSS

- Semantic HTML5 elements.
- Accessible: interactive controls must have ARIA labels where native semantics are insufficient.
- CSS custom properties for colours and spacing defined on `:root`.
- No inline styles in JS — use CSS classes toggled via `classList`.

## Commit Messages

- Format: `<type>(<scope>): <short description>` (Conventional Commits).
- Types: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `style`, `perf`.
- Scope examples: `crate`, `app`, `e2e`, `ci`, `docker`.
- Body: explain *why*, not *what* (the diff shows what).

## Pre-commit Hooks

All of the following run on every commit (configured in `.pre-commit-config.yaml`):

| Hook | What it checks |
| --- | --- |
| `rustfmt` | Rust formatting |
| `clippy` | Rust lints (deny warnings) |
| `eslint` | TypeScript lints |
| `prettier` | TS/HTML/CSS/JSON formatting |
| `conventional-commits` | Commit message format |
