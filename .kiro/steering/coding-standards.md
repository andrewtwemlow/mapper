---
inclusion: always
---

# Coding Standards

## General

- All public functions, types, modules, and constants **must** have documentation comments.
- **No dead code, unused imports, or dangling exports.** Every symbol that exists must be actively used. See the language-specific files (`coding-standards-rust.md`, `coding-standards-typescript.md`, `coding-standards-html-css.md`) for how this is enforced in each layer.
- Follow the principle of least surprise: names should describe what a function does, not how it does it.
- No magic numbers — use named constants.
- Errors must be handled explicitly; do not silently swallow them.

### Dead code policy

Dead code is any of the following:

- An import that is never referenced in the file.
- A variable, constant, or function that is declared but never called or read.
- An exported symbol that is not imported or used anywhere in the codebase.
- A `@deprecated` alias kept solely for backward compatibility that has no remaining callers outside of tests.

**What to do when you find dead code:**

1. Delete it. Do not comment it out — commented-out code is also dead code.
2. If it is a backward-compat alias, check whether any caller still needs it. If no caller exists, remove the alias too. If callers do exist (e.g. a test file that has not yet been migrated), document *exactly* which file is the remaining caller in the `@deprecated` JSDoc / doc comment and set a deadline for removal.
3. Never introduce a new export "in case it is useful later". Exports that have no callers at the time of writing are dead on arrival.

**Enforcement:**

| Layer | Tool | How |
| --- | --- | --- |
| Rust | `clippy --deny warnings` | `#[allow(dead_code)]` is forbidden except in test modules. `unused_imports` and `unused_variables` are errors. |
| TypeScript | ESLint `@typescript-eslint/no-unused-vars` | All unused variables and imports are errors. Run `npx eslint src/` to verify before committing. |
| TypeScript exports | ESLint `import/no-unused-modules` (when available) | Exported symbols with no external consumers are flagged. |

**The `TILE_LAYERS` backward-compat alias in `map.ts` is the one current exception** — it exists because E2E tests reference it directly and will be removed once Task 5 (E2E test updates) is complete. The `@deprecated` comment on that export names this spec as the authority.

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
