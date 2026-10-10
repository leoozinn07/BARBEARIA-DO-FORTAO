import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'prototipos/', 'var/', 'publico/icones/'] },
  js.configs.recommended,
  {
    files: ['servidor/**/*.js', 'scripts/**/*.js', 'testes/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
  },
  {
    files: ['publico/js/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser } },
  },
  { files: ['publico/js/tema.js'], languageOptions: { sourceType: 'script' } },
  { files: ['publico/sw.js'], languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: { ...globals.serviceworker } } },
  { rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }], 'no-empty': ['error', { allowEmptyCatch: true }] } },
];
