/**
 * @type {import('knip').KnipConfig}
 */
const config = {
  entry: ["src/core/**/*.js"],
  project: ["src/**/*.js", "test/**/*.js"],
  // Installed before any module imports it. Remove the name once a real import exists.
  ignoreDependencies: ["supertest"],
};

export default config;
