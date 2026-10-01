import { describe, expect, it } from "vitest";

import {
  createGoogleNewsFeed,
  parseFeed,
} from "../../src/infra/google-news.js";
import { givenCompany } from "../helpers/fakes.js";
import { readText } from "../helpers/files.js";

const LUDEO_FEED = readText(
  new URL("../fixtures/google-news-ludeo.xml", import.meta.url),
);

/**
 * @param {string} body XML inside `<channel>`.
 * @returns {string} An RSS document.
 */
const rss = (body) =>
  `<?xml version="1.0"?><rss version="2.0"><channel>${body}</channel></rss>`;

describe("parseFeed on a real Google News response", () => {
  it("reads every item with the publisher suffix removed from the title", () => {
    const [first] = parseFeed(LUDEO_FEED);

    expect(first).toEqual({
      guid: expect.stringMatching(/^CBMi/u),
      title:
        "Ludeo launches self-serve tool to convert gameplay video into instantly playable experiences",
      link: expect.stringMatching(
        /^https:\/\/news\.google\.com\/rss\/articles\//u,
      ),
      publishedAt: "2026-06-30T07:00:00.000Z",
      publisherName: "GamesBeat",
      publisherHomepage: "https://gamesbeat.com",
    });
  });

  it("keeps feed order", () => {
    const titles = parseFeed(LUDEO_FEED).map((item) => item.publisherName);

    expect(titles).toEqual(["GamesBeat", "80 Level"]);
  });
});

describe("parseFeed edge cases", () => {
  it("returns no items for an empty channel", () => {
    expect(parseFeed(rss(""))).toEqual([]);
  });

  it("keeps the whole title and no publisher when <source> is missing", () => {
    const [item] = parseFeed(
      rss(
        "<item><title>Wave raises - Reuters</title><link>https://g/a</link><guid>g1</guid><pubDate>Thu, 17 Sep 2026 07:00:00 GMT</pubDate></item>",
      ),
    );

    expect(item).toMatchObject({
      title: "Wave raises - Reuters",
      publisherName: undefined,
      publisherHomepage: undefined,
    });
  });

  it("rejects a body that is not RSS", () => {
    expect(() =>
      parseFeed(
        "<html><body>Our systems have detected unusual traffic</body></html>",
      ),
    ).toThrow("Google News returned a body that is not an RSS feed");
  });

  it.each([
    {
      name: "a guid",
      item: "<title>T</title><link>https://g/a</link><pubDate>Thu, 17 Sep 2026 07:00:00 GMT</pubDate>",
    },
    {
      name: "a valid pubDate",
      item: "<title>T</title><link>https://g/a</link><guid>g1</guid><pubDate>soon</pubDate>",
    },
  ])("rejects an item without $name", ({ item }) => {
    expect(() => parseFeed(rss(`<item>${item}</item>`))).toThrow(
      "Feed item 0 lacks a guid, title, link, or valid pubDate",
    );
  });
});

/**
 * @returns {{ http: import("../../src/infra/http.js").HttpClient, calls: { url: string, isBlocked: ((response: Response) => boolean) | undefined }[] }}
 *   A client that answers with the Ludeo fixture and records its calls.
 */
const givenHttp = () => {
  /**
   * @type {{ url: string, isBlocked: ((response: Response) => boolean) | undefined }[]}
   */
  const calls = [];
  return {
    calls,
    http: {
      getText: async (url, options = {}) => {
        calls.push({ url, isBlocked: options.isBlocked });
        return LUDEO_FEED;
      },
    },
  };
};
const WINDOW = {
  from: new Date("2026-07-01T00:00:00Z"),
  to: new Date("2026-10-01T00:00:00Z"),
};

describe("createGoogleNewsFeed", () => {
  it("requests the US English search feed with the encoded query", async () => {
    const { http, calls } = givenHttp();

    await createGoogleNewsFeed(http).search(
      givenCompany({ queryName: "Ludeo" }),
      WINDOW,
    );

    expect(calls[0]?.url).toBe(
      "https://news.google.com/rss/search?q=%22Ludeo%22%20after%3A2026-06-30%20before%3A2026-10-02&hl=en-US&gl=US&ceid=US:en",
    );
  });

  it("returns the parsed items", async () => {
    const { http } = givenHttp();

    const items = await createGoogleNewsFeed(http).search(
      givenCompany(),
      WINDOW,
    );

    expect(items).toHaveLength(2);
  });
});

describe("createGoogleNewsFeed block detection", () => {
  it.each([
    { contentType: "application/xml; charset=utf-8", blocked: false },
    { contentType: "text/html; charset=utf-8", blocked: true },
    { contentType: undefined, blocked: true },
  ])(
    "treats a $contentType body as blocked: $blocked",
    async ({ contentType, blocked }) => {
      const { http, calls } = givenHttp();
      await createGoogleNewsFeed(http).search(givenCompany(), WINDOW);
      const headers =
        contentType === undefined ? {} : { "content-type": contentType };

      expect(calls[0]?.isBlocked?.(new Response(undefined, { headers }))).toBe(
        blocked,
      );
    },
  );
});
