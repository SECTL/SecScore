import { defineConfig } from "eslint/config"
import tseslint from "typescript-eslint"
import eslintConfigPrettier from "eslint-config-prettier"
import eslintPluginReact from "eslint-plugin-react"
import eslintPluginReactHooks from "eslint-plugin-react-hooks"
import eslintPluginReactRefresh from "eslint-plugin-react-refresh"

export default defineConfig(
  {
    ignores: [
      "**/node_modules",
      "**/dist",
      "**/dist-ssr",
      "**/out",
      "**/src-tauri/target",
      "**/src-tauri/gen",
      "scripts/**",
    ],
  },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat["jsx-runtime"],
  {
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": eslintPluginReactHooks,
      "react-refresh": eslintPluginReactRefresh,
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "react-refresh/only-export-components": "off",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/set-state-in-effect": "off",
      "@typescript-eslint/no-require-imports": "off",
      "react/prop-types": "off",
    },
  },
  eslintConfigPrettier
)
