import { randomUUID } from "node:crypto";
import {
  closeSync,
  linkSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";

/**
 * One lock file per pipeline command (ADR 0003).
 * Backfill and the forward feed both use `feed` on the coverage database.
 * Digest and mail pass the alerts database. The other commands pass the coverage database.
 * A second copy of the same command exits. A different command may run at the same time.
 * @param {string} databasePath Database that command writes.
 * @param {"feed" | "unwrap" | "fetch" | "extract" | "classify" | "digest" | "mail"} command Command name.
 * @returns {string} Lock file next to that database.
 */
function commandLockPath(databasePath, command) {
  return `${databasePath}.${command}.lock`;
}

/**
 * Holds that command's lock until `work` finishes.
 * A live pid makes this throw before `work`, so the store is not opened.
 * A pid that is not running, or file contents that are not a pid, is a crashed holder.
 * This start takes the lock.
 * @template T
 * @param {string} databasePath Database that command writes.
 * @param {"feed" | "unwrap" | "fetch" | "extract" | "classify" | "digest" | "mail"} command Command name.
 * @param {() => T | Promise<T>} work The step body.
 * @returns {Promise<T>} What `work` returned.
 * @throws {Error} A running process still holds this command's lock.
 */
export async function withCommandLock(databasePath, command, work) {
  return withLock(commandLockPath(databasePath, command), work);
}

/**
 * Runs `work` while holding an exclusive lock file (ADR 0003).
 * The same rule covers the evaluation lock: a live pid throws before `work`.
 * A dead pid is renamed aside and this process creates the file, so two recovering starts cannot delete each other's lock.
 * The loser exits naming the holder. The lock is removed when `work` settles, whether it resolved or threw.
 * @template T
 * @param {string} path Lock file path. Its directory must exist.
 * @param {() => T | Promise<T>} work The job body.
 * @param {LockOps} [ops] Replacement for the rename and the link. Production omits this.
 * @returns {Promise<T>} What `work` returned.
 * @throws {Error} A running process holds the lock, or the lock cannot be created.
 */
export async function withLock(path, work, ops = {}) {
  acquire(path, ops);
  try {
    return await work();
  } finally {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- The path comes from configuration, not from a request.
    unlinkSync(path);
  }
}

/**
 * @typedef {object} LockOps
 * @property {(from: string, to: string) => void} [rename] Moves a stale lock aside.
 * @property {(from: string, to: string) => void} [link] Publishes a finished claim onto the lock path.
 */

/**
 * @param {string} path Lock file path.
 * @param {LockOps} ops Rename and create.
 * @returns {void}
 */
function acquire(path, ops) {
  const link = ops.link ?? linkSync;

  if (createLock(path, link)) {
    return;
  }

  const holder = readHolder(path);

  if (holder.alive) {
    throw heldBy(path, holder.label);
  }

  steal(path, ops.rename ?? renameSync, link);
}

/**
 * @param {string} path Lock file path.
 * @param {(from: string, to: string) => void} rename Moves the stale file aside.
 * @param {(from: string, to: string) => void} link Publishes a finished claim onto the lock path.
 * @returns {void}
 */
function steal(path, rename, link) {
  const aside = `${path}.${process.pid}.${randomUUID()}.stale`;
  const moved = moveAside(path, aside, rename);

  try {
    if (!createLock(path, link)) {
      throw heldBy(path, readHolder(path).label);
    }
  } finally {
    if (moved) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- The path comes from configuration, not from a request.
      unlinkSync(aside);
    }
  }
}

/**
 * @param {string} from Stale lock path.
 * @param {string} to Aside path.
 * @param {(from: string, to: string) => void} rename Move implementation.
 * @returns {boolean} True when this call moved the file.
 */
function moveAside(from, to, rename) {
  try {
    rename(from, to);
    return true;
  } catch (error) {
    if (codeOf(error) === "ENOENT") {
      return false;
    }

    throw error;
  }
}

/**
 * The visible lock appears only after the pid is written, via `link`.
 * `wx` plus a later write would leave an empty file that another start treats as a crash.
 * @param {string} path Lock file path.
 * @param {(from: string, to: string) => void} link Publishes the claim onto `path`.
 * @returns {boolean} True when this process created the file.
 */
function createLock(path, link) {
  const claim = `${path}.${process.pid}.${randomUUID()}.claim`;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- The path comes from configuration, not from a request.
  const fd = openSync(claim, "wx");

  try {
    writeSync(fd, String(process.pid));
  } finally {
    closeSync(fd);
  }

  try {
    link(claim, path);
  } catch (error) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- The path comes from configuration, not from a request.
    unlinkSync(claim);

    if (codeOf(error) === "EEXIST") {
      return false;
    }

    throw error;
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- The path comes from configuration, not from a request.
  unlinkSync(claim);

  return true;
}

/**
 * @typedef {object} LockHolder
 * @property {boolean} alive Whether the recorded pid is a running process.
 * @property {string} label Pid text for the error.
 */

/**
 * @param {string} path Lock file path.
 * @returns {LockHolder} Who the file names, if anyone is running.
 */
function readHolder(path) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- The path comes from configuration, not from a request.
  const text = readFileSync(path, "utf8").trim();
  const pid = parsePid(text);

  if (Number.isNaN(pid)) {
    return { alive: false, label: text === "" ? "unknown" : text };
  }

  return { alive: pidAlive(pid), label: String(pid) };
}

/**
 * A positive pid only. Zero would signal the whole process group.
 * @param {string} text Lock file contents.
 * @returns {number} The pid, or NaN when the text is not a safe positive integer.
 */
function parsePid(text) {
  if (!/^[1-9]\d*$/u.test(text)) {
    return NaN;
  }

  const pid = Number(text);

  return Number.isSafeInteger(pid) ? pid : NaN;
}

/**
 * @param {number} pid Process id from the lock file.
 * @returns {boolean} True when that process exists. EPERM counts as existing.
 */
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return codeOf(error) !== "ESRCH";
  }
}

/**
 * @param {string} path Lock file path.
 * @param {string} label Pid text.
 * @returns {Error} Refusal that names the holder.
 */
function heldBy(path, label) {
  return new Error(`Process ${label} holds ${path}`);
}

/**
 * @param {unknown} error Thrown value.
 * @returns {unknown} Node's `code`, when the value has one.
 */
function codeOf(error) {
  return error instanceof Error && "code" in error ? error.code : undefined;
}
