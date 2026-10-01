import { readFileSync } from "node:fs";

import { applyOverlay, parseOverlay } from "../core/overlay.js";
import { parseSeed } from "../core/seed.js";

/**
 * Reads the seed and the overlay from disk and merges them (ADR 0003).
 * @param {string} seedPath Plain-text seed, one company per line.
 * @param {string} overlayPath JSON overlay keyed by seed line.
 * @returns {import("../core/overlay.js").Company[]} Companies in seed order.
 * @throws {Error} A file is missing or malformed.
 */
export function loadCompanies(seedPath, overlayPath) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- The paths are repository constants or test fixtures.
  const seed = parseSeed(readFileSync(seedPath, "utf8"));
  const overlay = parseOverlay(readJson(overlayPath));
  return applyOverlay(seed, overlay);
}

/**
 * @param {string} path JSON file.
 * @returns {unknown} The parsed value.
 */
function readJson(path) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- The paths are repository constants or test fixtures.
  const text = readFileSync(path, "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON`, { cause: error });
  }
}
