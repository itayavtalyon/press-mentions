/**
 * @type {import('knip').KnipConfig}
 */
const config = {
  entry: ["src/core/**/*.js"],
  project: ["src/**/*.js", "test/**/*.js"],
  // Installed before any module imports them. Remove a name once a real import exists.
  ignoreDependencies: ["better-sqlite3", "ollama", "supertest"],
};

export default config;
