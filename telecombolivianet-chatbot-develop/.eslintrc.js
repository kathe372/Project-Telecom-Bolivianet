module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist/**/*', 'node_modules/**/*'],
  rules: {
    // These are off because the NestJS ecosystem relies heavily on decorators and any
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    // Warn instead of error — existing code has legitimate uses of `any`
    '@typescript-eslint/no-explicit-any': 'warn',
    // Catch unused variables (ignore underscore-prefixed intentional stubs)
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    // Disallow console.log in production code — use NestJS Logger instead
    'no-console': 'warn',
    // Allow empty catch blocks (common in fail-silent health checks)
    'no-empty': ['error', { allowEmptyCatch: true }],
  },
};
