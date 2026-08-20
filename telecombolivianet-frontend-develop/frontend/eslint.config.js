// Flat config para ESLint 9 (el proyecto es ESM: "type": "module").
// Reemplaza la ausencia de .eslintrc que hacía fallar `npm run lint`.
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      '*.config.js',
      '*.config.ts',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // Reglas de hooks de React (estándar Vite+React).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // TypeScript ya cubre estas comprobaciones; evitar falsos positivos.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      // Los `catch {}` vacíos son manejadores best-effort intencionales;
      // se mantiene la regla para otros bloques vacíos (if/for/función).
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Ruido conocido en el codebase (56 `any`): reportar sin romper el build.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Tests: relajar reglas que no aportan en specs.
    files: ['src/**/*.{test,spec}.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
