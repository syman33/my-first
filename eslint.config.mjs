import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'
import tseslint from 'typescript-eslint'

// Layering rule: UI code (components/hooks) must never reach the data layer
// directly. Data flows UI -> route handler / server component -> service ->
// repository -> database (see docs/architecture.md).
const uiMustNotImportDataLayer = {
  patterns: [
    {
      group: ['@/db', '@/db/*', '@/repositories/*', '@/generated/prisma/client', '@/services/*'],
      message:
        'UI components and hooks must not import the data/service layer. Pass data in as props from a Server Component, or call an API route.',
    },
  ],
}

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['**/*.{ts,tsx,mts}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'all', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-nocheck': true, 'ts-expect-error': 'allow-with-description' },
      ],
    },
  },
  {
    rules: {
      eqeqeq: ['error', 'always'],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-console': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
    },
  },
  {
    files: ['src/components/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', uiMustNotImportDataLayer],
    },
  },
  {
    // The logger is the single sanctioned console sink; CLI scripts and tests print to stdout.
    files: ['src/lib/logger.ts', 'scripts/**', 'prisma/seed/**', 'tests/**', '*.config.*'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'src/generated/**',
    'next-env.d.ts',
  ]),
])
