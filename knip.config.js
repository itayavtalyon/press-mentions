/**
 * @type {import('knip').KnipConfig}
 */
const config = {
  entry: ["src/core/**/*.js", "tools/*.mjs"],
  project: ["src/**/*.js", "test/**/*.js", "tools/*.mjs"],
};

export default config;
