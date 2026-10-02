/**
 * @type {import('knip').KnipConfig}
 */
const config = {
  entry: ["src/core/**/*.js", "tools/*.mjs"],
  project: ["src/**/*.js", "test/**/*.js", "tools/*.mjs"],
  // Installed before any module imports it. Remove the name once a real import exists.
  ignoreDependencies: ["@mozilla/readability"],
};

export default config;
