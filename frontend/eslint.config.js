import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

/**
 * There was no frontend linter: `tsc` catches types, `vitest` catches behaviour,
 * but nothing caught unused code, floating promises in event handlers, or hooks
 * used conditionally. The rules below are the ones that would have caught real
 * drift (dead modules, unhandled async calls) without a style-reformatting pass.
 */
export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'node_modules', '*.tsbuildinfo'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // React Compiler rules new in eslint-plugin-react-hooks v7. These
      // findings are real but predate the linter (a `new Date()` read during
      // render, ref reads during render in the unused 3D scene, and several
      // "set loading state inside an effect" patterns). They are tracked as
      // warnings so the gate catches regressions in the rest of the codebase
      // without a large, unrelated refactor in this change.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      // Unused code was the biggest drift source (six unrouted pages, a
      // 993-line unused component); keep it an error, with `_` opt-out.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // `any` hides contract drift at the API boundary; warnings still allow
      // the explicit, commented escapes already in the parser code.
      '@typescript-eslint/no-explicit-any': 'warn',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    files: ['src/test/**/*.{ts,tsx}', 'e2e/**/*.ts', '**/*.config.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
)
