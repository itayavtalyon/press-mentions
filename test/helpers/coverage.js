import path from "node:path";

import { onTestFinished } from "vitest";

import { openCoverageStore } from "../../src/infra/coverage-store.js";

import { givenTemporaryDirectory } from "./files.js";

/**
 * @returns {import("better-sqlite3").Database} An empty coverage store, closed after the test.
 */
export function givenCoverageStore() {
  const database = openCoverageStore(
    path.join(givenTemporaryDirectory(), "coverage.sqlite"),
  );
  onTestFinished(() => {
    database.close();
  });
  return database;
}

/**
 * @typedef {object} CompanyFixture
 * @property {string} id Slug.
 * @property {string} [displayName] Defaults to the id.
 * @property {string[]} [aliases] Defaults to none.
 * @property {string} [descriptor] Overlay descriptor.
 * @property {string} [backfilledAt] ISO timestamp.
 * @property {string} [website] Overlay host.
 */

/**
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {CompanyFixture} company Company to insert.
 * @returns {void}
 */
export function addCompany(database, company) {
  database
    .prepare(
      `INSERT INTO companies (id, display_name, query_name, aliases, descriptor, query_terms, backfilled_at, website)
       VALUES (@id, @displayName, @displayName, @aliases, @descriptor, '[]', @backfilledAt, @website)`,
    )
    .run({
      aliases: JSON.stringify(company.aliases ?? []),
      backfilledAt: company.backfilledAt,
      descriptor: company.descriptor,
      displayName: company.displayName ?? company.id,
      id: company.id,
      website: company.website,
    });
}

/**
 * @typedef {object} MentionFixture
 * @property {string} companyId Company slug, already added.
 * @property {string} guid Article id.
 * @property {string} publishedAt ISO timestamp from `toISOString`.
 * @property {string | undefined} verdict Stored verdict, undefined when not classified yet. Undefined binds as NULL.
 * @property {string} [title] Defaults to `Title <guid>`.
 * @property {string} [publisherName] Publisher name.
 * @property {string} [publisherUrl] Unwrapped URL.
 * @property {string} [publisherHomepage] Publisher homepage from the feed.
 * @property {"body" | "title"} [textSource] Defaults to `body`.
 * @property {string} [extractedText] Article text.
 * @property {string} [rawResponse] Model reply.
 */

/**
 * Inserts the article when it is new, then links it to the company with a verdict.
 * @param {import("better-sqlite3").Database} database Coverage store.
 * @param {MentionFixture} mention Article and link.
 * @returns {void}
 */
export function addMention(database, mention) {
  database
    .prepare(
      `INSERT INTO articles (guid, title, published_at, publisher_name, publisher_homepage, publisher_url,
         google_url, extracted_text, text_source, stage)
       VALUES (@guid, @title, @publishedAt, @publisherName, @publisherHomepage, @publisherUrl,
         @googleUrl, @extractedText, @textSource, 'classify')
       ON CONFLICT (guid) DO NOTHING`,
    )
    .run({
      extractedText: mention.extractedText,
      googleUrl: `https://news.google.com/rss/articles/${mention.guid}`,
      guid: mention.guid,
      publishedAt: mention.publishedAt,
      publisherHomepage: mention.publisherHomepage,
      publisherName: mention.publisherName,
      publisherUrl: mention.publisherUrl,
      textSource: mention.textSource ?? "body",
      title: mention.title ?? `Title ${mention.guid}`,
    });
  database
    .prepare(
      `INSERT INTO company_articles (company_id, guid, origin, verdict, raw_response, review_flag)
       VALUES (@companyId, @guid, 'backfill', @verdict, @rawResponse, @reviewFlag)`,
    )
    .run({
      companyId: mention.companyId,
      guid: mention.guid,
      rawResponse: mention.rawResponse,
      reviewFlag: mention.verdict === "uncertain" ? 1 : 0,
      verdict: mention.verdict,
    });
}
