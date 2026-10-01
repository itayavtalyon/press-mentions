import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.js"],
      // ADR 0009: entry shims only wire adapters and call a tested function.
      exclude: [
        "src/jobs/backfill.js",
        "src/jobs/daily.js",
        "src/jobs/mail.js",
        "src/jobs/prompt-eval/index.js",
        "src/server/index.js",
      ],
      reporter: ["text", "text-summary"],
      thresholds: {
        lines: 100,
        statements: 100,
        functions: 100,
        branches: 100,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["test/**/*.test.js"],
          exclude: ["test/web/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "web",
          environment: "happy-dom",
          include: ["test/web/**/*.test.js"],
        },
      },
    ],
  },
});
