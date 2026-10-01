import { DOMParser } from "linkedom";

import { buildQuery } from "../core/query.js";

const ENDPOINT = "https://news.google.com/rss/search";

/**
 * @typedef {object} XmlNode The part of a linkedom element this adapter reads.
 * @property {(selector: string) => XmlNode | null} querySelector First matching descendant.
 * @property {string} textContent Text content.
 * @property {(name: string) => string | null} getAttribute Attribute value.
 */

/**
 * Creates the Google News RSS feed adapter (ADR 0003): US English, one request per search.
 * @param {import("./http.js").HttpClient} http Throttle-aware client.
 * @returns {import("../core/collect.js").Feed} The feed port.
 */
export function createGoogleNewsFeed(http) {
  return {
    search: async (company, window) => {
      const query = encodeURIComponent(buildQuery(company, window));
      const xml = await http.getText(
        `${ENDPOINT}?q=${query}&hl=en-US&gl=US&ceid=US:en`,
        { isBlocked: isNotXml },
      );
      return parseFeed(xml);
    },
  };
}

/**
 * Parses a Google News RSS document.
 * @param {string} xml Response body.
 * @returns {import("../core/collect.js").FeedItem[]} Items in feed order.
 * @throws {Error} The body is not RSS, or an item lacks a guid, title, link, or valid pubDate.
 */
export function parseFeed(xml) {
  const document = new DOMParser().parseFromString(xml, "text/xml");
  if (document.querySelector("rss > channel") === null) {
    throw new Error("Google News returned a body that is not an RSS feed");
  }
  return [...document.querySelectorAll("item")].map((item, index) =>
    parseItem(item, index),
  );
}

/**
 * A consent or "unusual traffic" page comes back as HTML with a 200. Treat it as throttling.
 * @param {Response} response Fetch response.
 * @returns {boolean} Whether the body is not XML.
 */
function isNotXml(response) {
  return !(response.headers.get("content-type") ?? "").includes("xml");
}

/**
 * @param {XmlNode} item `<item>` element.
 * @param {number} index Position, for the error message.
 * @returns {import("../core/collect.js").FeedItem} The item.
 */
function parseItem(item, index) {
  const guid = textOf(item, "guid");
  const title = textOf(item, "title");
  const link = textOf(item, "link");
  const published = new Date(textOf(item, "pubDate"));
  if (
    guid === "" ||
    title === "" ||
    link === "" ||
    Number.isNaN(published.getTime())
  ) {
    throw new Error(
      `Feed item ${index} lacks a guid, title, link, or valid pubDate`,
    );
  }
  const source = item.querySelector("source");
  const publisherName = source?.textContent.trim() || undefined;
  return {
    guid,
    title: stripPublisher(title, publisherName),
    link,
    publishedAt: published.toISOString(),
    publisherName,
    publisherHomepage: source?.getAttribute("url") ?? undefined,
  };
}

/**
 * @param {XmlNode} item Parent element.
 * @param {string} tag Child tag.
 * @returns {string} The child's trimmed text, or "" when it is absent.
 */
function textOf(item, tag) {
  return item.querySelector(tag)?.textContent.trim() ?? "";
}

/**
 * Google appends " - Publisher" to every headline.
 * @param {string} title Feed title.
 * @param {string | undefined} publisherName Publisher from `<source>`.
 * @returns {string} The headline alone.
 */
function stripPublisher(title, publisherName) {
  const suffix = ` - ${publisherName}`;
  return publisherName !== undefined && title.endsWith(suffix)
    ? title.slice(0, -suffix.length)
    : title;
}
