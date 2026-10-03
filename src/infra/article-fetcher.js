import { BlockList, isIP } from "node:net";

/**
 * A publisher URL the fetcher will not request (ADR 0006).
 */
export class RefusedUrlError extends Error {
  /**
   * @param {string} url Requested URL.
   * @param {string} reason Why it was refused.
   */
  constructor(url, reason) {
    super(`Refused ${url}: ${reason}`);
    this.name = "RefusedUrlError";
    this.url = url;
  }
}

const REFUSED = refusedAddresses();

/**
 * @typedef {Pick<import("./http.js").HttpClient, "getText">} ArticleHttp
 */

/**
 * @typedef {object} ArticleFetcher
 * @property {(url: string) => Promise<string>} fetchArticle
 *   GETs a public http(s) URL. Throws {@link RefusedUrlError} before any request otherwise.
 */

/**
 * Exercise article fetcher (ADR 0006). It checks the URL it was given.
 * Redirects stay inside the HTTP client. It does not resolve DNS.
 * @param {ArticleHttp} http Throttle-aware client.
 * @returns {ArticleFetcher} The fetcher.
 */
export function createArticleFetcher(http) {
  return {
    fetchArticle: async (url) => {
      const reason = refusalReason(url);
      if (reason !== "") {
        throw new RefusedUrlError(url, reason);
      }
      return http.getText(url);
    },
  };
}

/**
 * Loopback, link-local, and private literals, including their IPv4-mapped IPv6 forms.
 * @returns {BlockList} Hosts the fetcher refuses.
 */
function refusedAddresses() {
  /* eslint-disable sonarjs/no-hardcoded-ip -- These ranges are the ones the fetcher refuses. */
  const list = new BlockList();
  list.addSubnet("0.0.0.0", 8, "ipv4");
  list.addSubnet("10.0.0.0", 8, "ipv4");
  list.addSubnet("127.0.0.0", 8, "ipv4");
  list.addSubnet("169.254.0.0", 16, "ipv4");
  list.addSubnet("172.16.0.0", 12, "ipv4");
  list.addSubnet("192.168.0.0", 16, "ipv4");
  list.addAddress("::1", "ipv6");
  list.addSubnet("fc00::", 7, "ipv6");
  list.addSubnet("fe80::", 10, "ipv6");
  list.addSubnet("::ffff:0.0.0.0", 104, "ipv6");
  list.addSubnet("::ffff:10.0.0.0", 104, "ipv6");
  list.addSubnet("::ffff:127.0.0.0", 104, "ipv6");
  list.addSubnet("::ffff:169.254.0.0", 112, "ipv6");
  list.addSubnet("::ffff:172.16.0.0", 108, "ipv6");
  list.addSubnet("::ffff:192.168.0.0", 112, "ipv6");
  /* eslint-enable sonarjs/no-hardcoded-ip -- End of the refused-range list. */
  return list;
}

/**
 * @param {string} url Publisher URL.
 * @returns {string} Why the URL is refused, or "" when it may be requested.
 */
function refusalReason(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "not a URL";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `scheme ${parsed.protocol}`;
  }
  const host = bareHost(parsed.hostname);
  return isLocalName(host) || isRefusedAddress(host) ? `host ${host}` : "";
}

/**
 * @param {string} hostname URL hostname, which may keep brackets or a trailing dot.
 * @returns {string} Host without one trailing dot and without brackets.
 */
function bareHost(hostname) {
  const withoutDot = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
  return withoutDot.startsWith("[") && withoutDot.endsWith("]")
    ? withoutDot.slice(1, -1)
    : withoutDot;
}

/**
 * @param {string} host Hostname from {@link bareHost}.
 * @returns {boolean} Whether the name is localhost.
 */
function isLocalName(host) {
  const name = host.toLowerCase();
  return name === "localhost" || name.endsWith(".localhost");
}

/**
 * @param {string} host Hostname from {@link bareHost}.
 * @returns {boolean} Whether the host is a refused IP literal.
 */
function isRefusedAddress(host) {
  const kind = isIP(host);
  return kind !== 0 && REFUSED.check(host, kind === 4 ? "ipv4" : "ipv6");
}
