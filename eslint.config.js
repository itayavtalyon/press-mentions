import js from "@eslint/js";
import comments from "@eslint-community/eslint-plugin-eslint-comments";
import prettier from "eslint-config-prettier";
import importX from "eslint-plugin-import-x";
import jsdoc from "eslint-plugin-jsdoc";
import n from "eslint-plugin-n";
import promise from "eslint-plugin-promise";
import regexp from "eslint-plugin-regexp";
import security from "eslint-plugin-security";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";

const nodeGlobalsOff = Object.fromEntries(
  Object.keys(globals.node).map((name) => [name, "off"]),
);

const config = [
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      ".jscpd-report/**",
      "report/**",
    ],
  },
  js.configs.recommended,
  n.configs["flat/recommended-module"],
  promise.configs["flat/recommended"],
  importX.flatConfigs.recommended,
  unicorn.configs.recommended,
  sonarjs.configs.recommended,
  regexp.configs["flat/recommended"],
  security.configs.recommended,
  jsdoc.configs["flat/recommended-error"],
  {
    plugins: {
      "@eslint-community/eslint-comments": comments,
    },
    rules: {
      ...comments.configs.recommended.rules,
      "@eslint-community/eslint-comments/no-unused-disable": "error",
      "@eslint-community/eslint-comments/require-description": "error",
    },
  },
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: globals.node,
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    settings: {
      "import-x/ignore": ["node_modules"],
      jsdoc: {
        mode: "typescript",
      },
    },
    rules: {
      curly: ["error", "all"],
      eqeqeq: ["error", "always"],
      "no-console": "error",
      "no-implicit-coercion": "error",
      "no-param-reassign": ["error", { props: true }],
      "no-shadow": ["error", { builtinGlobals: true, hoist: "all" }],
      "no-var": "error",
      "prefer-const": "error",
      "consistent-return": "error",
      complexity: ["error", 10],
      "max-depth": ["error", 3],
      "max-params": ["error", 4],
      "max-lines": [
        "error",
        { max: 300, skipBlankLines: false, skipComments: false },
      ],
      "max-lines-per-function": [
        "error",
        { max: 60, skipBlankLines: false, skipComments: false },
      ],
      "n/file-extension-in-import": ["error", "always"],
      "import-x/no-cycle": "error",
      "import-x/no-named-as-default": "error",
      "import-x/no-named-as-default-member": "error",
      "import-x/no-duplicates": "error",
      "import-x/order": [
        "error",
        {
          alphabetize: { order: "asc", caseInsensitive: true },
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            "object",
            "type",
          ],
          "newlines-between": "always",
        },
      ],
      "promise/no-nesting": "error",
      "promise/no-promise-in-callback": "error",
      "promise/no-callback-in-promise": "error",
      "promise/no-return-in-finally": "error",
      "promise/valid-params": "error",
      "regexp/confusing-quantifier": "error",
      "regexp/no-empty-alternative": "error",
      "regexp/no-lazy-ends": "error",
      "regexp/no-potentially-useless-backreference": "error",
      "regexp/no-useless-flag": "error",
      "regexp/optimal-lookaround-quantifier": "error",
      "security/detect-buffer-noassert": "error",
      "security/detect-child-process": "error",
      "security/detect-disable-mustache-escape": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-new-buffer": "error",
      "security/detect-no-csrf-before-method-override": "error",
      "security/detect-non-literal-fs-filename": "error",
      "security/detect-non-literal-regexp": "error",
      "security/detect-non-literal-require": "error",
      "security/detect-object-injection": "error",
      "security/detect-possible-timing-attacks": "error",
      "security/detect-pseudoRandomBytes": "error",
      "security/detect-unsafe-regex": "error",
      "security/detect-bidi-characters": "error",
      "security/detect-invisible-characters": "error",
    },
  },
  {
    files: ["src/**/*.js"],
    rules: {
      "n/no-unpublished-import": ["error", { ignorePrivate: false }],
    },
  },
  {
    files: ["src/web/**/*.js"],
    languageOptions: {
      globals: {
        ...nodeGlobalsOff,
        ...globals.browser,
      },
    },
  },
  {
    files: ["test/**/*.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["test/web/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  {
    files: ["src/server/index.js", "src/jobs/daily.js", "src/**/logger.js"],
    rules: {
      "no-console": "off",
    },
  },
  prettier,
];

export default config;
