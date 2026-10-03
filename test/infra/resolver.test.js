import { describe, expect, it } from "vitest";

import { createArticleResolver } from "../../src/infra/resolver.js";

const ARTICLE = "https://news.google.com/rss/articles/CBMiToken";
const PAGE = '<div data-n-a-sg="sig+value" data-n-a-ts="1710000000"></div>';

/* eslint-disable unicorn/no-null, unicorn/prefer-https, sonarjs/no-clear-text-protocols -- The fixture keeps a Google http URL and JSON null. */
/**
 * The public garturlreq shell.
 * @type {unknown[]}
 */
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
const STORY = JSON.stringify([
  "garturlres",
  "http://news.google.com/rss/articles/x",
  "javascript:alert(1)",
  "https://publisher.example/story",
]);
const BATCH = `)]}'\n\n25\n${JSON.stringify([["wrb.fr", "Fbv4je", "[not json", null, null, null, "generic", STORY]])}`;
/* eslint-enable unicorn/no-null, unicorn/prefer-https, sonarjs/no-clear-text-protocols -- End of the recipe fixture. */

/**
 * @param {{ page?: string, pages?: Map<string, string>, batch?: string }} [bodies] Canned responses.
 * @returns {{ calls: { method: string, url: string, body?: string, isBlocked?: (response: Response) => boolean }[], http: import("../../src/infra/http.js").HttpClient }} Recorded client.
 */
function givenHttp(bodies = {}) {
  /**
   * @type {{ method: string, url: string, body?: string, isBlocked?: (response: Response) => boolean }[]}
   */
  const calls = [];
  /**
   * @param {string} method HTTP method.
   * @param {string} url Request URL.
   * @param {{ isBlocked?: (response: Response) => boolean }} options Request options.
   * @param {string} [body] POST body.
   * @returns {void}
   */
  const record = (method, url, options, body) => {
    /**
     * @type {{ method: string, url: string, body?: string, isBlocked?: (response: Response) => boolean }}
     */
    const call = body === undefined ? { method, url } : { body, method, url };
    if (options.isBlocked !== undefined) {
      call.isBlocked = options.isBlocked;
    }
    calls.push(call);
  };
  return {
    calls,
    http: {
      getText: async (url, options = {}) => {
        record("GET", url, options);
        return bodies.pages?.get(url) ?? bodies.page ?? PAGE;
      },
      postForm: async (url, body, options = {}) => {
        record("POST", url, options, body);
        return bodies.batch ?? BATCH;
      },
    },
  };
}

describe("createArticleResolver batch", () => {
  it("posts every signed article once and pairs publisher URLs by the echoed index", async () => {
    const first = "https://news.google.com/rss/articles/Alpha";
    const second = "https://news.google.com/rss/articles/Beta";
    const { calls, http } = givenHttp({
      pages: new Map([
        [first, '<div data-n-a-sg="sig-a" data-n-a-ts="1710000001"></div>'],
        [second, '<div data-n-a-sg="sig-b" data-n-a-ts="1710000002"></div>'],
      ]),
      batch: batched([
        frame("2", "https://publisher.example/beta"),
        frame("1", "https://publisher.example/alpha"),
      ]),
    });
    const resolver = createArticleResolver(http);

    const opened = [await resolver.sign(first), await resolver.sign(second)];
    const urls = await resolver.post(opened);

    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
    expect(calls[2]?.url).toBe(
      "https://news.google.com/_/DotsSplashUi/data/batchexecute",
    );
    const posted = JSON.parse(
      new URLSearchParams(calls[2]?.body ?? "").get("f.req") ?? "",
    );
    expect(
      posted[0].map((/** @type {unknown[]} */ call) => call.at(3)),
    ).toEqual(["1", "2"]);
    expect(JSON.parse(posted[0][0][1])).toEqual([
      "garturlreq",
      SHELL,
      "Alpha",
      1_710_000_001,
      "sig-a",
    ]);
    expect(JSON.parse(posted[0][1][1])[2]).toBe("Beta");
    expect(urls.get(first)).toBe("https://publisher.example/alpha");
    expect(urls.get(second)).toBe("https://publisher.example/beta");
  });
});

describe("createArticleResolver batch misses", () => {
  it("omits an article the batch did not resolve", async () => {
    const alpha = "https://news.google.com/rss/articles/Alpha";
    const googleOnly = "https://news.google.com/rss/articles/Google";
    const missing = "https://news.google.com/rss/articles/Missing";
    const { http } = givenHttp({
      batch: batched([
        frame(1, "https://publisher.example/ignored"),
        frame("2", "https://news.google.com/rss/articles/x"),
        frame("1", "https://publisher.example/alpha"),
      ]),
    });

    const urls = await createArticleResolver(http).post([
      signed(alpha, "Alpha"),
      signed(googleOnly, "Google"),
      signed(missing, "Missing"),
    ]);

    expect(urls.get(alpha)).toBe("https://publisher.example/alpha");
    expect(urls.size).toBe(1);
  });
});

/**
 * @param {string} googleUrl Stored article URL.
 * @param {string} articleId Last path segment.
 * @returns {import("../../src/infra/resolver.js").SignedArticle} A signed article.
 */
function signed(googleUrl, articleId) {
  return { articleId, googleUrl, signature: "sig", timestamp: "1" };
}

/**
 * @param {unknown} echo 1-based index echoed in `wrb.fr` slot 6.
 * @param {string} publisher Publisher URL inside that frame.
 * @returns {unknown[]} One `Fbv4je` frame.
 */
function frame(echo, publisher) {
  // prettier-ignore
  return ["wrb.fr", "Fbv4je", JSON.stringify(["garturlres", publisher]), null, null, null, echo]; // eslint-disable-line unicorn/no-null -- The public wrb.fr row uses JSON null.
}

/**
 * @param {unknown[]} frames `wrb.fr` rows, not necessarily in request order.
 * @returns {string} A length-prefixed batchexecute body.
 */
function batched(frames) {
  const lines = ["not-json", ...frames.map((row) => JSON.stringify([row]))];
  const chunks = lines.map((line) => `${line.length}\n${line}`);
  return `)]}'\n\n${chunks.join("\n")}`;
}

describe("createArticleResolver", () => {
  it("posts one article as generic and returns the first publisher URL", async () => {
    const { calls, http } = givenHttp();
    const resolver = createArticleResolver(http);

    const urls = await resolver.post([await resolver.sign(ARTICLE)]);

    expect(urls.get(ARTICLE)).toBe("https://publisher.example/story");
    expect(calls[0]).toMatchObject({ method: "GET", url: ARTICLE });
    expect(calls[1]?.url).toBe(
      "https://news.google.com/_/DotsSplashUi/data/batchexecute",
    );
    const posted = JSON.parse(
      new URLSearchParams(calls[1]?.body ?? "").get("f.req") ?? "",
    );
    expect(posted[0][0][3]).toBe("generic");
    expect(JSON.parse(posted[0][0][1])).toEqual([
      "garturlreq",
      SHELL,
      "CBMiToken",
      1_710_000_000,
      "sig+value",
    ]);
  });
});

describe("createArticleResolver failures", () => {
  it("rejects a page that has no signature", async () => {
    const { calls, http } = givenHttp({ page: "<html>consent</html>" });

    await expect(createArticleResolver(http).sign(ARTICLE)).rejects.toThrow(
      /Unresolved /u,
    );
    expect(calls).toHaveLength(1);
  });

  it("omits the article when its frame has no publisher URL", async () => {
    const { http } = givenHttp({
      batch: `)]}'\n[["wrb.fr","Fbv4je","[\\"garturlres\\"]"]]`,
    });
    const resolver = createArticleResolver(http);

    const urls = await resolver.post([await resolver.sign(ARTICLE)]);

    expect(urls.has(ARTICLE)).toBe(false);
  });

  it("rejects a timestamp that is not digits", async () => {
    const { calls, http } = givenHttp({
      page: '<div data-n-a-sg="sig" data-n-a-ts="soon"></div>',
    });

    await expect(createArticleResolver(http).sign(ARTICLE)).rejects.toThrow(
      /Unresolved /u,
    );
    expect(calls).toHaveLength(1);
  });

  it("rejects a Google URL with no article id before requesting it", async () => {
    const { calls, http } = givenHttp();

    await expect(
      createArticleResolver(http).sign("https://news.google.com/"),
    ).rejects.toThrow(/Unresolved /u);
    expect(calls).toEqual([]);
  });

  it("rejects a batch body that is not a Fbv4je batch", async () => {
    const { http } = givenHttp({
      batch: `)]}'\n["https://publisher.example/stray"]`,
    });
    const resolver = createArticleResolver(http);

    await expect(resolver.post([await resolver.sign(ARTICLE)])).rejects.toThrow(
      /Unparsed batch/u,
    );
  });
});

describe("createArticleResolver block pages", () => {
  it("treats a non-HTML article page as blocked", async () => {
    const { calls, http } = givenHttp();
    await createArticleResolver(http).sign(ARTICLE);
    expectBlock(calls[0]?.isBlocked, false);
  });

  it("treats an HTML batch body as blocked", async () => {
    const { calls, http } = givenHttp();
    await createArticleResolver(http).post([signed(ARTICLE, "CBMiToken")]);
    expectBlock(calls[0]?.isBlocked, true);
  });
});

/**
 * @param {((response: Response) => boolean) | undefined} isBlocked Recorded check.
 * @param {boolean} htmlIsBlocked Whether an HTML body counts as blocked.
 */
function expectBlock(isBlocked, htmlIsBlocked) {
  if (isBlocked === undefined) {
    throw new Error("request did not record a block check");
  }
  const html = new Response("", { headers: { "content-type": "text/html" } });
  const plain = new Response("", { headers: { "content-type": "text/plain" } });
  const missing = new Response("");
  missing.headers.delete("content-type");
  expect(isBlocked(html)).toBe(htmlIsBlocked);
  expect(isBlocked(plain)).toBe(!htmlIsBlocked);
  expect(isBlocked(missing)).toBe(!htmlIsBlocked);
}
