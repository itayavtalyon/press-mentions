/* eslint-disable security/detect-non-literal-fs-filename -- Test helpers touch only paths inside a fresh temp directory. */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { onTestFinished } from "vitest";

/**
 * Creates an empty directory that is removed when the current test finishes.
 * @returns {string} Absolute directory path.
 */
export function givenTemporaryDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), "press-mentions-"));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

/**
 * Writes a file into a directory.
 * @param {string} directory Directory from givenTemporaryDirectory.
 * @param {string} name File name.
 * @param {string} content File contents.
 * @returns {string} Absolute file path.
 */
export function givenFile(directory, name, content) {
  const file = path.join(directory, name);
  writeFileSync(file, content);
  return file;
}

/**
 * @param {string} file Absolute path.
 * @returns {boolean} Whether the file exists.
 */
export function fileExists(file) {
  return existsSync(file);
}

/**
 * @param {string | URL} file Absolute path or file URL.
 * @returns {string} UTF-8 contents.
 */
export function readText(file) {
  return readFileSync(file, "utf8");
}
/* eslint-enable security/detect-non-literal-fs-filename -- End of the temp-directory helpers. */
