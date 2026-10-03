import { describe, expect, it } from "vitest";

import { createArticleFetcher } from "../../src/infra/article-fetcher.js";

/**
 * @returns {{ calls: string[], http: import("../../src/infra/http.js").HttpClient }} A client that records GET urls.
 */
function givenHttp() {
  /**
   * @type {string[]}
   */
  const calls = [];
  return {
    calls,
    http: {
      getText: async (url) => {
        calls.push(url);
        return "<p>body</p>";
      },
      postForm: async () => {
        throw new Error("fetch does not post");
      },
    },
  };
}

describe("createArticleFetcher", () => {
  it("returns the body of a public https URL", async () => {
    const { calls, http } = givenHttp();
    const articles = createArticleFetcher(http);

    await expect(
      articles.fetchArticle("https://example.com/story"),
    ).resolves.toBe("<p>body</p>");
    expect(calls).toEqual(["https://example.com/story"]);
  });

  it("allows a public http URL", async () => {
    const { calls, http } = givenHttp();
    /* eslint-disable unicorn/prefer-https -- Public http is allowed. */
    await createArticleFetcher(http).fetchArticle("http://example.com/plain");
    expect(calls).toEqual(["http://example.com/plain"]);
    /* eslint-enable unicorn/prefer-https -- End of the public http case. */
  });
});

it("allows an address outside the private ranges", async () => {
  const { calls, http } = givenHttp();

  await createArticleFetcher(http).fetchArticle("https://172.32.0.1/story");
  await createArticleFetcher(http).fetchArticle("https://8.8.8.8/story");
  await createArticleFetcher(http).fetchArticle(
    "https://[2001:4860:4860::8888]/story",
  );
  await createArticleFetcher(http).fetchArticle(
    "https://[::ffff:8.8.8.8]/story",
  );

  expect(calls).toEqual([
    "https://172.32.0.1/story",
    "https://8.8.8.8/story",
    "https://[2001:4860:4860::8888]/story",
    "https://[::ffff:8.8.8.8]/story",
  ]);
});

describe("createArticleFetcher refuses", () => {
  it.each([
    ["javascript:alert(1)", "scheme"],
    ["file:///etc/passwd", "scheme"],
    ["example.com/story", "not a url"],
    ["", "not a url"],
    ["https://localhost/story", "localhost"],
    ["https://localhost./story", "localhost"],
    ["https://Foo.LOCALHOST/story", "localhost"],
    ["https://127.0.0.1/story", "loopback"],
    ["https://127.0.0.1:9/story", "loopback"],
    ["https://10.1.2.3/story", "private"],
    ["https://172.16.5.1/story", "private"],
    ["https://172.31.255.255/story", "private"],
    ["https://192.168.1.1/story", "private"],
    ["https://169.254.1.1/story", "link-local"],
    ["https://0.1.2.3/story", "this-network"],
    ["https://[::1]/story", "loopback"],
    ["https://[fe80::1]/story", "link-local"],
    ["https://[fc00::1]/story", "private"],
    ["https://[fd12::1]/story", "private"],
    ["https://[::ffff:127.0.0.1]/story", "mapped loopback"],
    ["https://[::ffff:10.1.2.3]/story", "mapped private"],
  ])("refuses %s (%s) without a request", async (url) => {
    const { calls, http } = givenHttp();

    await expect(createArticleFetcher(http).fetchArticle(url)).rejects.toThrow(
      /Refused /u,
    );
    expect(calls).toEqual([]);
  });
});
