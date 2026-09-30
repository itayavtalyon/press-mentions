/**
 * @type {import('lint-staged').Configuration}
 */
const config = {
  "*.js": [
    "prettier --write",
    "eslint --fix --max-warnings 0",
    "vitest related --run --passWithNoTests",
  ],
  "*.{css,html,json,md,yaml,yml}": ["prettier --write"],
};

export default config;
