/**
 * A clock frozen at `start`. Sleep records the wait and returns at once, so concurrent callers see the same now.
 * @param {number} [start] Starting milliseconds since the epoch.
 * @returns {{ clock: import("../../src/infra/clock.js").Clock, sleeps: number[] }} Clock and its recorded sleeps.
 */
export function givenClock(start = 0) {
  /**
   * @type {number[]}
   */
  const sleeps = [];
  return {
    clock: {
      now: () => start,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    },
    sleeps,
  };
}

/**
 * @param {Partial<import("../../src/core/overlay.js").Company>} [overrides] Fields this test cares about.
 * @returns {import("../../src/core/overlay.js").Company} A company with no aliases, descriptor, or terms.
 */
export function givenCompany(overrides = {}) {
  return {
    id: "harvey",
    displayName: "Harvey",
    queryName: "Harvey",
    aliases: [],
    descriptor: undefined,
    queryTerms: [],
    ...overrides,
  };
}

/**
 * @param {string} guid Article id.
 * @param {string} publishedAt ISO timestamp.
 * @returns {import("../../src/core/collect.js").FeedItem} A feed item.
 */
export function givenItem(guid, publishedAt) {
  return {
    guid,
    title: `Title ${guid}`,
    link: `https://news.google.com/rss/articles/${guid}`,
    publishedAt,
    publisherName: "Example News",
    publisherHomepage: "https://news.example.com",
  };
}

/**
 * @param {number} count How many.
 * @param {string} prefix Guid prefix; guids are `${prefix}-0` and up.
 * @param {string} publishedAt ISO timestamp shared by all of them.
 * @returns {import("../../src/core/collect.js").FeedItem[]} Feed items.
 */
export function givenItems(count, prefix, publishedAt) {
  return Array.from({ length: count }, (_, index) =>
    givenItem(`${prefix}-${index}`, publishedAt),
  );
}

/**
 * @returns {{ log: import("../../src/infra/logger.js").Log, events: { event: string, fields: Record<string, unknown> }[] }}
 *   A logger that records events instead of printing them.
 */
export function givenLog() {
  /**
   * @type {{ event: string, fields: Record<string, unknown> }[]}
   */
  const events = [];
  return {
    log: (event, fields = {}) => {
      events.push({ event, fields });
    },
    events,
  };
}

/**
 * @param {(signed: readonly import("../../src/infra/resolver.js").SignedArticle[]) => Promise<Map<string, string>>} post The one batch POST.
 * @returns {import("../../src/infra/resolver.js").ArticleResolver} Every GET signs. The POST is the caller's.
 */
export function signing(post) {
  return {
    post,
    sign: async (googleUrl) => ({
      articleId: "id",
      googleUrl,
      signature: "sig",
      timestamp: "1",
    }),
  };
}

/**
 * @param {(googleUrl: string) => Promise<string>} resolve Publisher URL, or a throw from the GET.
 * @returns {import("../../src/infra/resolver.js").ArticleResolver} A resolver that signs, then posts once.
 */
export function resolving(resolve) {
  /**
   * @type {Map<string, string>}
   */
  const urls = new Map();
  return {
    post: async (signed) => {
      const paired = new Map();
      for (const article of signed) {
        const publisher = urls.get(article.googleUrl);
        if (publisher !== undefined) {
          paired.set(article.googleUrl, publisher);
        }
      }
      return paired;
    },
    sign: async (googleUrl) => {
      urls.set(googleUrl, await resolve(googleUrl));
      return {
        articleId: "id",
        googleUrl,
        signature: "sig",
        timestamp: "1",
      };
    },
  };
}
