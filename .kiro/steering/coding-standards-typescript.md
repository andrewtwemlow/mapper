---
inclusion: fileMatch
fileMatchPattern: "**/*.ts"
---

# TypeScript Coding Standards (app/)

## Style

- Strict TypeScript (`"strict": true` in tsconfig).
- No `any` — use `unknown` and narrow, or define proper types.
- ESLint with `@typescript-eslint/recommended` (enforced by pre-commit hook).
- Prettier for formatting (enforced by pre-commit hook).
- Use `const` by default; `let` only when reassignment is necessary.

## npm dependencies

- Pin all dependencies to exact versions (no `^` or `~` ranges) so builds are reproducible.
- **Run `npm audit` immediately after any `npm install`.** Do not use a dependency that has known high or critical severity vulnerabilities. If the audit reports vulnerabilities, update to a fixed version before proceeding.
- When pinning a new package version, verify the version exists on npm and is not in a known vulnerable range for that package.

## ES module compatibility

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

## Module conventions

- Each file has a single clear responsibility (see repo layout in `project.md`).
- Prefer named exports over default exports.
- Import Wasm functions only through `src/wasm.ts` — no direct imports of the generated pkg elsewhere.

## Error handling

- Wasm calls must be wrapped in try/catch; errors must surface to the user via the UI (not just the console).
- File parsing failures for individual files must not abort the whole batch — report the error per-file and continue.

## Documentation

- All exported functions and types must have JSDoc comments.
- Non-obvious logic blocks get inline comments.
