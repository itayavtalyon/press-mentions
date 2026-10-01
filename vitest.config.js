import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.js"],
      exclude: ["src/jobs/prompt-eval/index.js"],
      reporter: ["text", "text-summary"],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 90,
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
