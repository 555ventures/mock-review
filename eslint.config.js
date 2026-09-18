import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // `.claude/worktrees/**`: git worktrees live inside the repo, so a worktree for another branch
  // (or a throwaway spike host with its own React app) is otherwise linted as if it were this
  // tree's source — failing `npm run check` at the repo root over files no change here owns.
  { ignores: ['dist/**', '.test-dist/**', 'node_modules/**', 'docs/**', '.claude/worktrees/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
)
