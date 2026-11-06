/**
 * @file css.d.ts
 * Ambient module declaration for CSS files.
 * TypeScript 6 (TS2882) requires side-effect imports of non-JS files to have
 * a matching type declaration. This satisfies that check for `import './style.css'`.
 */
declare module "*.css" {
  const _: string;
  export default _;
}
