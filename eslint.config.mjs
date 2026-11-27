import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';

export default defineConfig([
  globalIgnores(['node_modules/**', '.next/**', 'src-tauri/target/**', 'src-tauri/gen/**', 'coverage/**']),
  {
    files: ['desktop/**/*.{js,mjs}', 'extension/*.js', 'skills/**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser, ...globals.node, ...globals.webextensions, chrome: 'readonly', Highlight: 'readonly' } },
    rules: { 'no-undef': 'error' },
  },
]);
