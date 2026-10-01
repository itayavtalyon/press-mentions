import {
  closeSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from "node:fs";

/**
 * Runs `work` while holding an exclusive lock file, so two jobs never write the stores together (ADR 0003).
 * The lock is removed when `work` settles, whether it resolved or threw.
 * ponytail: a crash leaves the file behind, and the error says to delete it. Add a pid liveness check if that bites.
 * @template T
 * @param {string} path Lock file path. Its directory must exist.
 * @param {() => T | Promise<T>} work The job body.
 * @returns {Promise<T>} What `work` returned.
 * @throws {Error} Another process holds the lock, or the lock cannot be created.
 */
export async function withLock(path, work) {
  acquire(path);
  try {
    return await work();
  } finally {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- The path comes from configuration, not from a request.
    unlinkSync(path);
  }
}

/**
 * @param {string} path Lock file path.
 * @returns {void}
 */
function acquire(path) {
  let fd;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- The path comes from configuration, not from a request.
    fd = openSync(path, "wx");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new Error(
        `${describeHolder(path)} holds ${path}. If no job is running, delete that file`,
        {
          cause: error,
        },
      );
    }
    throw error;
  }
  try {
    writeSync(fd, String(process.pid));
  } finally {
    closeSync(fd);
  }
}

/**
 * @param {string} path Lock file path.
 * @returns {string} "Process <pid>", from the file's contents.
 */
function describeHolder(path) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- The path comes from configuration, not from a request.
  return `Process ${readFileSync(path, "utf8").trim()}`;
}
