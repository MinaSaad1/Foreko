import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// Deliberately narrow. tsc already owns type correctness, so this covers what a
// typechecker cannot see: hook rules, unreachable logic, and accidental
// globals. Rules that only argue about formatting are left off; they would
// generate noise across the existing codebase without catching a defect.
export default tseslint.config(
  {
    ignores: ["dist/**", "e2e/artifacts/**", "coverage/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Calling a hook conditionally is a real bug in any React codebase.
      "react-hooks/rules-of-hooks": "error",
      // A dependency the effect reads but does not declare is a real bug, not
      // a style opinion: it silently serves stale data. Warn rather than error
      // because the existing occurrences are deliberate and reviewed.
      "react-hooks/exhaustive-deps": "warn",

      // react-hooks v7 ships React Compiler rules. This app does not use the
      // compiler, and on working code they flag architecture rather than
      // defects: setting state from a fetched result, module-level caches,
      // Date.now during render. Turning them on would mean rewriting sound code
      // to satisfy a compiler that is not in the build. Revisit if Tempolith
      // adopts React Compiler.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/globals": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",

      "react-refresh/only-export-components": "off",
      // The codebase uses leading-underscore names for deliberate throwaways.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // `any` is worth flagging but is not worth failing an existing codebase
      // over; tsc is the real gate on types.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "src/test/**", "e2e/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
