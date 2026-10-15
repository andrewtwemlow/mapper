import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      // Extend recommended rules
      ...tseslint.configs["recommended"].rules,

      // Enforce no explicit `any`
      "@typescript-eslint/no-explicit-any": "error",

      // Require explicit return types on functions and class methods
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        { allowExpressions: true },
      ],

      // Prefer `const` over `let` where possible
      "prefer-const": "error",

      // No unused variables (handled by TypeScript strict mode, but belt-and-braces)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],

      // Disallow non-null assertions — use proper narrowing
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
];
