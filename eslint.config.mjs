import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsdoc from 'eslint-plugin-jsdoc';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default [
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './examples/react/tsconfig.json'],
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Enforce TSDoc on the public API surface: entry points, shared types, and error classes.
    files: ['src/executor.ts', 'src/sign-page.ts', 'src/types.ts', 'src/sign-page.errors.ts'],
    plugins: { jsdoc },
    settings: { jsdoc: { mode: 'typescript' } },
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          require: {
            ArrowFunctionExpression: true,
            FunctionDeclaration: true,
            ClassDeclaration: true,
          },
          contexts: ['TSTypeAliasDeclaration', 'TSInterfaceDeclaration'],
        },
      ],
      'jsdoc/require-description': [
        'error',
        {
          contexts: ['any'],
        },
      ],
      'jsdoc/require-param': 'error',
      'jsdoc/require-param-description': 'error',
      'jsdoc/require-returns': ['error', { forceReturnsWithAsync: false }],
      'jsdoc/require-returns-description': 'error',
    },
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['./*', '../*'],
              message: 'Use the `@/` alias for internal library imports instead of relative paths.',
            },
          ],
        },
      ],
    },
  },
];
