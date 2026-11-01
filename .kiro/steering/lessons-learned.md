---
inclusion: always
---

# Lessons Learned

This file records bugs that were found and fixed, and test failures that were diagnosed and resolved. Before writing new code or fixing a bug, read this file. If the work you're doing touches an area listed here, apply the relevant lesson proactively — don't wait for the same failure to recur.

When a new bug is fixed or a non-obvious test failure is resolved, add an entry here following the format below.

---

## Format

```
### [Short title] — [Layer: Rust | TypeScript | E2E | CSS]

**Symptom:** What went wrong and how it presented (error message, test output, wrong behaviour).
**Root cause:** The underlying reason it happened.
**Fix:** What was changed to resolve it.
**Watch for:** The pattern to avoid or check when working in this area again.
```

---

## Rust

### Self-closing `<trkpt>` elements never pushed — Rust

**Symptom:** `parse_valid_gpx_returns_two_points` returned 1 point instead of 2; `parse_zero_coordinate_is_valid` returned `NoTrackPoints` for a file with one valid point.

**Root cause:** `Event::Start` and `Event::Empty` were merged into a single match arm. Self-closing `<trkpt lat="..." lon="..."/>` fires only `Event::Empty` — no `Event::End` follows — so the point was created but the push logic that ran on `Event::End` was never reached.

**Fix:** Split the merged arm into separate `Event::Start` (hold coordinates, wait for elevation) and `Event::Empty` (push immediately with no elevation) arms.

**Watch for:** Any XML parser loop using `quick-xml`. Always handle `Event::Empty` separately from `Event::Start` for elements that can appear in both self-closing and open/close forms. Write tests that include at least one self-closing and one paired open/close form of every element you parse.

---

### Raw string literals silently truncated by `#` in delimiter — Rust

**Symptom:** Cryptic compile errors inside a raw string (e.g. `r#"..."#`) when the string body contains `#` characters such as hex colour codes or CSS selectors.

**Root cause:** The closing delimiter `"#` matched an earlier `"#` sequence inside the string body, silently terminating the literal early.

**Fix:** Use `r##"..."##` (or more `#` chars as needed) for any raw string containing `#`. The rule is: count the `#` characters in the closing delimiter so that no `"#…#` sequence of the same length appears inside the string.

**Watch for:** Any raw string containing hex colour values (`#1f77b4`), CSS selectors (`#id`, `.class`), HTML attribute values with `#`, or URLs with fragments. Grep for `r#"` and verify the body contains no `#` before using it.

---

### Borrow on temporary dropped before use — Rust

**Symptom:** Borrow-checker error: "temporary value dropped while borrowed" or "does not live long enough".

**Root cause:** Calling `.as_ref()` (or any borrow method) on a method return value in the same expression where the borrow is used beyond that statement. The temporary is dropped at the end of the expression, before the borrow is done with it.

**Fix:** Bind the owned value to a `let` binding first so it lives for the full scope, then borrow from the binding:

```rust
// ❌ Temporary dropped before borrow is used
let name = local_name(e.name().as_ref());

// ✅ Binding keeps the value alive
let name_bytes = e.name();
let name = local_name(name_bytes.as_ref());
```

**Watch for:** Any `quick-xml` event field access (`.name()`, `.value()`, `.key()`), and any other method returning an owned value that is immediately borrowed. Check these call sites first when the borrow checker complains about temporaries.

---

## TypeScript

### `__dirname` not defined in ES modules — TypeScript

**Symptom:** `ReferenceError: __dirname is not defined` at runtime or in tests.

**Root cause:** `__dirname` is a CommonJS global and does not exist in ES module context (`"type": "module"`).

**Fix:** Use `path.dirname(fileURLToPath(import.meta.url))` to get the directory of the current file:

```typescript
import { fileURLToPath } from "url";
import path from "path";
const DIR = path.dirname(fileURLToPath(import.meta.url));
```

**Watch for:** Any new file in `app/src/` or `tests/` that needs to resolve a path relative to itself. Also watch for `path.resolve(fileURLToPath(import.meta.url), "../..")` — this resolves relative to the *file path*, not its directory; the first `..` strips the filename and gives an unexpected result. Always call `path.dirname()` first.

---

### Wasm-pack generates `any` return types — TypeScript

**Symptom:** TypeScript strict-mode errors or `any` leaking into the type system after a `wasm-pack build`.

**Root cause:** `wasm-pack` emits `any` for `JsValue` returns in the generated `.d.ts` because it has no type information about what the Rust function returns across the boundary.

**Fix:** After every `wasm-pack build`, patch the generated declaration file:

```bash
sed -i 's/): any;/): unknown;/g' app/src/wasm-pkg/gpx_mapper.d.ts
```

**Watch for:** Any new Wasm export that returns `JsValue` will also be typed as `any` after the next build. Make this sed patch part of your post-build routine and check the `.d.ts` diff before committing.

---

## E2E / Playwright

### Hardcoded test-data filenames break when files are renamed — E2E

**Symptom:** E2E tests fail with "file not found" or "no such file" after test data files are renamed or added.

**Root cause:** Test specs referenced specific filenames from `test-data/` directly instead of using the `test-data.ts` helper.

**Fix:** Always import from `tests/e2e/test-data.ts`. Use `gpxFiles()[0]`, `fitGzFiles()[0]`, `tcxGzFiles()[0]` etc. Guard with `test.skip` when the array is empty.

**Watch for:** Any new spec that needs a file from `test-data/`. Never hardcode a filename. When two files of the same type are needed, use index access (`[0]`, `[1]`) and add a `test.skip(files.length < 2, ...)` guard.

---

*Add new entries here as bugs are fixed and test failures resolved. Keep entries permanent — do not remove them once added.*
