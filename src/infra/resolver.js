const BATCH_URL = "https://news.google.com/_/DotsSplashUi/data/batchexecute";
const NOT_JSON = Symbol("not json");
const SIGNATURE = /data-n-a-sg="([^"]*)"/u;
const TIMESTAMP = /data-n-a-ts="([^"]*)"/u;

/* eslint-disable unicorn/no-null -- The public garturlreq shell uses JSON null. */
const SHELL = [
  [
    "X",
    "X",
    ["X", "X"],
    null,
    null,
    1,
    1,
    "US:en",
    null,
    1,
    null,
    null,
    null,
    null,
    null,
    0,
    1,
  ],
  "X",
  "X",
  1,
  [1, 1, 1],
  1,
  1,
  null,
  0,
  0,
  null,
  0,
];
/* eslint-enable unicorn/no-null -- End of the public shell. */

/**
 * The article page could not be turned into a publisher URL (ADR 0006).
 */
export class UnresolvedError extends Error {
  /**
   * @param {string} url Google article URL.
   * @param {string} reason Why it did not resolve.
   */
  constructor(url, reason) {
    super(`Unresolved ${url}: ${reason}`);
    this.name = "UnresolvedError";
    this.url = url;
  }
}

/**
 * The `batchexecute` body was not a batch of `Fbv4je` frames (ADR 0006).
 */
export class BatchError extends Error {
  /**
   * Names the missing frame so the row's `last_error` says what came back.
   */
  constructor() {
    super("Unparsed batch: no Fbv4je frame");
    this.name = "BatchError";
  }
}

/**
 * @typedef {object} SignedArticle
 * @property {string} googleUrl Stored Google article URL.
 * @property {string} articleId Last path segment.
 * @property {string} timestamp `data-n-a-ts`.
 * @property {string} signature `data-n-a-sg`.
 */

/**
 * @typedef {object} ArticleResolver
 * @property {(googleUrl: string) => Promise<SignedArticle>} sign
 *   GET the article page and return its signature.
 * @property {(signed: readonly SignedArticle[]) => Promise<Map<string, string>>} post
 *   POST the signed set once. Keys are the Google URLs that resolved.
 */

/**
 * Google News token resolver (ADR 0003). Each signature is one GET. The signed set is one POST.
 * @param {import("./http.js").HttpClient} http Throttle-aware client.
 * @returns {ArticleResolver} The resolver.
 */
export function createArticleResolver(http) {
  return {
    post: (signed) => postSigned(http, signed),
    sign: (googleUrl) => signArticle(http, googleUrl),
  };
}

/**
 * @param {import("./http.js").HttpClient} http Throttle-aware client.
 * @param {string} googleUrl Stored Google article URL.
 * @returns {Promise<SignedArticle>} Signature fields for the batch.
 */
async function signArticle(http, googleUrl) {
  const articleId =
    new URL(googleUrl).pathname.split("/").findLast((part) => part !== "") ??
    "";
  if (articleId === "") {
    throw new UnresolvedError(googleUrl, "no article id");
  }
  const page = await http.getText(googleUrl, {
    isBlocked: (response) =>
      !(response.headers.get("content-type") ?? "").includes("html"),
  });
  const signature = SIGNATURE.exec(page)?.[1] ?? "";
  const timestamp = TIMESTAMP.exec(page)?.[1] ?? "";
  if (signature === "" || !/^\d+$/u.test(timestamp)) {
    throw new UnresolvedError(googleUrl, "no signature");
  }
  return { articleId, googleUrl, signature, timestamp };
}

/**
 * @param {import("./http.js").HttpClient} http Throttle-aware client.
 * @param {readonly SignedArticle[]} signed Articles that produced a signature, in request order.
 * @returns {Promise<Map<string, string>>} Publisher URLs keyed by Google article URL.
 */
async function postSigned(http, signed) {
  const body = await http.postForm(BATCH_URL, formBody(signed), {
    isBlocked: (response) =>
      (response.headers.get("content-type") ?? "").includes("html"),
  });
  const parsed = parseBatch(body);
  const frames = fbv4jeFrames(parsed);
  if (frames.length === 0) {
    throw new BatchError();
  }
  if (signed.length !== 1) {
    return publishersByEcho(signed, frames);
  }
  const publisher = firstPublisherUrl(parsed);
  const urls = new Map();
  for (const article of signed) {
    if (publisher !== "") {
      urls.set(article.googleUrl, publisher);
    }
  }
  return urls;
}

/**
 * @param {readonly SignedArticle[]} signed Request order. Index 0 is echo `"1"`.
 * @param {unknown[][]} frames `Fbv4je` rows. Body order is not request order.
 * @returns {Map<string, string>} Publisher URLs for echoes that carried one.
 */
function publishersByEcho(signed, frames) {
  const urls = new Map();
  for (const frame of frames) {
    const echo = frame.at(6);
    const publisher = firstPublisherUrl(frame);
    if (typeof echo === "string" && publisher !== "") {
      urls.set(echo, publisher);
    }
  }
  const paired = new Map();
  for (const [index, article] of signed.entries()) {
    const publisher = urls.get(String(index + 1));
    if (publisher !== undefined) {
      paired.set(article.googleUrl, publisher);
    }
  }
  return paired;
}

/**
 * @param {readonly SignedArticle[]} signed Request order.
 * @returns {string} `application/x-www-form-urlencoded` body.
 */
function formBody(signed) {
  const calls = signed.map((article, index) => {
    const inner = JSON.stringify([
      "garturlreq",
      SHELL,
      article.articleId,
      Number(article.timestamp),
      article.signature,
    ]);
    const slot = signed.length === 1 ? "generic" : String(index + 1);
    // eslint-disable-next-line unicorn/no-null -- The public Fbv4je envelope uses JSON null.
    return ["Fbv4je", inner, null, slot];
  });
  return new URLSearchParams({ "f.req": JSON.stringify([calls]) }).toString();
}

/**
 * @param {unknown} value Parsed batchexecute value.
 * @returns {unknown[][]} `wrb.fr` rows whose rpc is `Fbv4je`.
 */
function fbv4jeFrames(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  if (value.at(0) === "wrb.fr" && value.at(1) === "Fbv4je") {
    return [value];
  }
  const frames = [];
  for (const item of value) {
    frames.push(...fbv4jeFrames(item));
  }
  return frames;
}

/**
 * @param {string} body Batchexecute body, including the `)]}'` prefix.
 * @returns {unknown} Parsed payload. Separate length-prefixed chunks stay a list.
 */
function parseBatch(body) {
  const lines = body
    .replace(/^\)\]\}'\n?/u, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !/^\d+$/u.test(line));
  const joined = parsedJson(lines.join("\n"));
  if (joined !== NOT_JSON) {
    return joined;
  }
  return lines.flatMap((line) => {
    const parsed = parsedJson(line);
    return parsed === NOT_JSON ? [] : [parsed];
  });
}

/**
 * @param {string} text One chunk, or the chunks joined.
 * @returns {unknown} Parsed JSON, or `NOT_JSON` when it is not JSON.
 */
function parsedJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return NOT_JSON;
  }
}

/**
 * @param {unknown} value Decoded batchexecute value.
 * @returns {string} The first http(s) URL whose host is not `news.google.com`, or "".
 */
function firstPublisherUrl(value) {
  if (typeof value === "string") {
    return publisherFrom(value);
  }
  if (!Array.isArray(value)) {
    return "";
  }
  for (const item of value) {
    const found = firstPublisherUrl(item);
    if (found !== "") {
      return found;
    }
  }
  return "";
}

/**
 * @param {string} value A string from the payload.
 * @returns {string} A publisher URL found in it, or "".
 */
function publisherFrom(value) {
  const direct = httpUrl(value);
  if (direct !== "") {
    return direct;
  }
  if (!value.startsWith("[")) {
    return "";
  }
  try {
    return firstPublisherUrl(JSON.parse(value));
  } catch {
    return "";
  }
}

/**
 * @param {string} value Candidate URL.
 * @returns {string} The same string when it is a publisher URL, otherwise "".
 */
function httpUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "";
  }
  return parsed.hostname.toLowerCase() === "news.google.com" ? "" : value;
}
