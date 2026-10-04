import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.js", "tools/**/*.mjs"],
      // ADR 0009: entry shims only wire adapters and call a tested function.
      exclude: [
        "src/jobs/backfill.js",
        "src/jobs/feed.js",
        "src/jobs/unwrap.js",
        "src/jobs/fetch.js",
        "src/jobs/extract.js",
        "src/jobs/classify.js",
        "src/jobs/eligible.js",
        "src/jobs/digest.js",
        "src/jobs/mail.js",
        "src/jobs/export.js",
        "src/jobs/prompt-eval/index.js",
        "src/server/index.js",
        // These two only drive a real browser; `just ui-check` runs them.
        "tools/shoot.mjs",
        "tools/axe.mjs",
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
          exclude: ["test/ui/browser/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "web",
          environment: "happy-dom",
          // ADR 0009: tests never open the network, so happy-dom must not fetch page assets.
          environmentOptions: {
            happyDOM: {
              settings: {
                disableCSSFileLoading: true,
                disableJavaScriptFileLoading: true,
              },
            },
          },
          include: ["test/ui/browser/**/*.test.js"],
        },
      },
    ],
  },
});
