---
inclusion: fileMatch
fileMatchPattern: "**/*.rs"
---

# Rust Coding Standards (crate/)

## Style

- Follow the official [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/).
- Format with `rustfmt` (enforced by pre-commit hook).
- Lint with `clippy --deny warnings` (enforced by pre-commit hook).
- Edition: 2021.
- **Run `cargo check` after writing or modifying any Rust file.** Do not present Rust code as complete until `cargo check` passes. This catches borrow errors, type errors, and syntax issues (including raw string delimiter mistakes) before the full wasm-pack build.

## Raw string literals

- Raw strings containing `#` characters (e.g. hex colour values, CSS, HTML) **must** use at least `r##"..."##` delimiters. Using `r#"..."#` when the string body contains `#` will silently terminate the literal early, causing cryptic compile errors.
- Rule of thumb: count the `#` chars needed so no `"#` sequence inside the string matches the closing delimiter. When in doubt, use `r##`.

## Borrow checker and temporaries

- Never call `.as_ref()` (or any borrow method) on a temporary in the same expression where the reference is used beyond that statement. Bind to a `let` first:

  ```rust
  // ❌ Temporary dropped before borrow is used
  let name = local_name(e.name().as_ref());

  // ✅ Temporary lives for the whole block
  let name_bytes = e.name();
  let name = local_name(name_bytes.as_ref());
  ```

- This pattern is especially common with `quick-xml` event names and any method returning an owned value that is immediately borrowed.

## wasm-pack generated declarations

The `wasm-pack build` command regenerates `app/src/wasm-pkg/gpx_mapper.d.ts` on every build. The generated file uses `any` as the return type for `parse_gpx`, `parse_fit`, and `parse_tcx`. This must be manually corrected to `unknown` after every wasm-pack run:

```bash
# After wasm-pack build, fix the any returns:
sed -i 's/): any;/): unknown;/g' app/src/wasm-pkg/gpx_mapper.d.ts
```

**Why:** wasm-pack does not know the TypeScript type of the `JsValue` returned across the Wasm boundary, so it emits `any`. The project standard is `unknown` with explicit narrowing (the cast to `ParsedTrack` happens in `wasm.ts` with a safety comment).

**Reminder:** When adding a new Wasm export that returns `JsValue`, the generated declaration will also use `any` — correct it after rebuilding.

## Wasm / wasm-bindgen

- All public Wasm exports must be annotated with `#[wasm_bindgen]`.
- Errors crossing the Wasm boundary must be returned as `Result<T, JsValue>` so callers can catch them in JS.
- Use `wasm_bindgen::JsError` (or `JsValue::from(e.to_string())`) for error propagation — never panic across the Wasm boundary.
- Keep the public API surface minimal: expose only what the JS layer needs.

## Error handling

- Use `thiserror` for typed domain errors inside the crate.
- Convert to `JsValue` at the Wasm boundary only.

## Testing

- Unit tests live in `crate/src/` as `#[cfg(test)]` modules.
- Integration tests that require a browser runtime go in `tests/unit/` via Vitest + `@vitest/browser`.

## Documentation

- Every public `fn`, `struct`, `enum`, and `mod` gets a `///` doc comment.
- `lib.rs` must have a module-level `//!` comment describing the crate purpose.
