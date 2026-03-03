import * as cheerio from "cheerio";
import { parseEuropeanDateToIso } from "../lib/date";
import { normalizeDescription, normalizeWhitespace } from "../lib/normalize";
import type { Event } from "../types";

export const CARINA_PROGRAM_URL = "https://www.cafe-carina.at/2020/program/";
const CARINA_FIRST_PAGE_LIMIT = 12;

type FetchLike = typeof fetch;

type CarinaOverviewEvent = {
  date?: string;
  title: string;
  image: string;
  url: string;
};

const GERMAN_MONTHS: Record<string, string> = {
  janner: "01",
  jaenner: "01",
  januar: "01",
  februar: "02",
  maerz: "03",
  marz: "03",
  april: "04",
  mai: "05",
  juni: "06",
  juli: "07",
  august: "08",
  september: "09",
  oktober: "10",
  november: "11",
  dezember: "12",
};

function normalizeMonthKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase();
}

function toAbsoluteUrl(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function shouldRetryFetch(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  if (message.includes("fetch failed")) {
    return true;
  }

  const cause = (error as Error & { cause?: { code?: string } }).cause;
  const code = cause?.code ?? "";
  return code === "UND_ERR_SOCKET" || code === "ECONNRESET" || code === "ETIMEDOUT";
}

function parseCarinaDateToIso(value: string): string | null {
  const normalized = normalizeWhitespace(value);
  const direct = parseEuropeanDateToIso(normalized);
  if (direct) {
    return direct;
  }

  const match = normalized.match(/(\d{1,2})\s+([A-Za-zÄÖÜäöüß]+)\s+(\d{4})/);
  if (!match) {
    return null;
  }

  const day = String(Number(match[1])).padStart(2, "0");
  const month = GERMAN_MONTHS[normalizeMonthKey(match[2])];
  const year = match[3];

  if (!month) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function parseDateFromDetailHtml(html: string): string | null {
  const $ = cheerio.load(html);
  const candidates = [
    normalizeWhitespace($(".mec-start-date-label").first().text()),
    normalizeWhitespace($(".mec-single-event-date").first().text()),
    normalizeWhitespace($(".mec-event-date").first().text()),
    normalizeWhitespace($("time").first().text()),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const parsed = parseCarinaDateToIso(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function parseTitleFromDetailHtml(html: string, fallbackTitle = ""): string {
  const $ = cheerio.load(html);
  const directCandidates = [
    normalizeWhitespace($(".mec-single-title").first().text()),
    normalizeWhitespace($("h1.entry-title").first().text()),
    normalizeWhitespace($(".mec-event-title").first().text()),
  ].filter(Boolean);

  if (directCandidates.length > 0) {
    return directCandidates[0];
  }

  const documentTitle = normalizeWhitespace($("title").first().text());
  if (documentTitle) {
    return documentTitle.split("|")[0]?.split("–")[0]?.trim() ?? documentTitle;
  }

  return fallbackTitle;
}

function extractDescriptionFromDetailHtml(html: string): string {
  const $ = cheerio.load(html);
  const container = $("div.mec-single-event-description.mec-events-content").first();
  if (container.length === 0) {
    return "";
  }

  const htmlContent = container.html() ?? "";
  const prepared = htmlContent
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<\/div\s*>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/li\s*>/gi, "\n");

  const text = cheerio.load(`<div>${prepared}</div>`)("div").text();
  return normalizeDescription(text);
}

function extractOverviewEventsFromHtml(html: string, sourceUrl: string): CarinaOverviewEvent[] {
  const $ = cheerio.load(html);
  const events: CarinaOverviewEvent[] = [];

  $("article.mec-event-article").each((_, node) => {
    const article = $(node);

    const dateText = normalizeWhitespace(article.find(".mec-event-date").first().text());
    const date = parseCarinaDateToIso(dateText);
    if (!date) {
      return;
    }

    const titleAnchor = article.find(".mec-event-title > a").first();
    const title = normalizeWhitespace(titleAnchor.text());
    if (!title || /ruhetag/i.test(title)) {
      return;
    }

    const href = normalizeWhitespace(titleAnchor.attr("href") ?? "");
    if (!href) {
      return;
    }

    const imageElement = article.find("img").first();
    const imageSrc = normalizeWhitespace(
      imageElement.attr("src") ?? imageElement.attr("data-src") ?? "",
    );

    events.push({
      date,
      title,
      image: imageSrc ? toAbsoluteUrl(imageSrc, sourceUrl) : "",
      url: toAbsoluteUrl(href, sourceUrl),
    });
  });

  return events;
}

function discoverRssUrlsFromProgramHtml(html: string, sourceUrl: string): string[] {
  const $ = cheerio.load(html);
  const candidates = new Set<string>();

  // Hard-priority feed path seen on Cafe Carina.
  candidates.add(new URL("/2020/program/rss-feed/", sourceUrl).toString());

  $("a[href], link[href]").each((_, node) => {
    const element = $(node);
    const href = normalizeWhitespace(element.attr("href") ?? "");
    const text = normalizeWhitespace(element.text());
    const type = normalizeWhitespace(element.attr("type") ?? "");
    const rel = normalizeWhitespace(element.attr("rel") ?? "");
    if (!href) {
      return;
    }

    if (/rss/i.test(href) || /rss/i.test(text) || /rss/i.test(type) || /alternate/i.test(rel) && /feed/i.test(href)) {
      candidates.add(toAbsoluteUrl(href, sourceUrl));
    }
  });

  const sorted = Array.from(candidates).sort((a, b) => {
    const aIsProgramFeed = /\/program\/rss-feed\/?$/i.test(a);
    const bIsProgramFeed = /\/program\/rss-feed\/?$/i.test(b);

    if (aIsProgramFeed && !bIsProgramFeed) {
      return -1;
    }
    if (!aIsProgramFeed && bIsProgramFeed) {
      return 1;
    }
    return 0;
  });

  return sorted;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function extractOverviewEventsFromRssXml(xml: string, sourceUrl: string): CarinaOverviewEvent[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const events: CarinaOverviewEvent[] = [];

  for (const item of items) {
    const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/i);
    const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/i);

    const rawTitle = titleMatch ? (titleMatch[1] ?? titleMatch[2] ?? "") : "";
    const rawLink = linkMatch ? linkMatch[1] ?? "" : "";
    const title = normalizeWhitespace(decodeXmlEntities(rawTitle));
    const link = normalizeWhitespace(decodeXmlEntities(rawLink));

    if (!title || !link || /ruhetag/i.test(title)) {
      continue;
    }

    events.push({
      title,
      url: toAbsoluteUrl(link, sourceUrl),
      image: "",
    });
  }

  return events;
}

function extractOverviewEventsFromRssHtml(html: string, sourceUrl: string): CarinaOverviewEvent[] {
  const $ = cheerio.load(html);
  const events: CarinaOverviewEvent[] = [];

  $("a[href]").each((_, node) => {
    const anchor = $(node);
    const href = normalizeWhitespace(anchor.attr("href") ?? "");
    const title = normalizeWhitespace(anchor.text());
    if (!href || !title) {
      return;
    }

    const absoluteUrl = toAbsoluteUrl(href, sourceUrl);
    if (!/\/events\//i.test(absoluteUrl) || /ruhetag/i.test(title)) {
      return;
    }

    events.push({
      title,
      url: absoluteUrl,
      image: "",
    });
  });

  return uniqueByUrl(events);
}

function extractOverviewEventsFromRssPayload(payload: string, sourceUrl: string): CarinaOverviewEvent[] {
  const isXml = payload.trimStart().startsWith("<?xml") || /<rss[\s>]/i.test(payload);
  if (isXml) {
    return extractOverviewEventsFromRssXml(payload, sourceUrl);
  }

  const htmlEvents = extractOverviewEventsFromHtml(payload, sourceUrl);
  if (htmlEvents.length > 0) {
    return htmlEvents;
  }

  return extractOverviewEventsFromRssHtml(payload, sourceUrl);
}

function extractLocUrlsFromXml(xml: string, baseUrl: string): string[] {
  const locations = xml.match(/<loc>([\s\S]*?)<\/loc>/gi) ?? [];
  const urls: string[] = [];

  for (const location of locations) {
    const match = location.match(/<loc>([\s\S]*?)<\/loc>/i);
    const raw = normalizeWhitespace(decodeXmlEntities(match?.[1] ?? ""));
    if (!raw) {
      continue;
    }
    urls.push(toAbsoluteUrl(raw, baseUrl));
  }

  return urls;
}

function titleFromEventUrl(url: string): string {
  const withoutQuery = url.split("?")[0] ?? url;
  const parts = withoutQuery.split("/").filter(Boolean);
  const slug = parts[parts.length - 1] ?? "";
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

async function discoverEventUrlsViaWordPressSitemaps(
  fetchImpl: FetchLike,
  siteRoot: string,
): Promise<string[]> {
  const indexUrl = new URL("wp-sitemap.xml", siteRoot).toString();
  const indexXml = await fetchHtml(fetchImpl, indexUrl);

  const sitemapUrls = extractLocUrlsFromXml(indexXml, siteRoot)
    .filter((url) => /sitemap/i.test(url))
    .sort((a, b) => {
      const aLooksEvent = /(event|mec|post)/i.test(a);
      const bLooksEvent = /(event|mec|post)/i.test(b);
      if (aLooksEvent && !bLooksEvent) return -1;
      if (!aLooksEvent && bLooksEvent) return 1;
      return 0;
    })
    .slice(0, 20);

  const eventUrls = new Set<string>();

  for (const sitemapUrl of sitemapUrls) {
    try {
      const xml = await fetchHtml(fetchImpl, sitemapUrl);
      const locs = extractLocUrlsFromXml(xml, sitemapUrl);
      for (const loc of locs) {
        if (/\/events\//i.test(loc)) {
          eventUrls.add(loc);
        }
      }
    } catch {
      // Ignore a single sitemap fetch failure.
    }
  }

  return Array.from(eventUrls);
}

function uniqueByUrl(events: CarinaOverviewEvent[]): CarinaOverviewEvent[] {
  const byUrl = new Map<string, CarinaOverviewEvent>();
  for (const event of events) {
    if (!byUrl.has(event.url)) {
      byUrl.set(event.url, event);
    }
  }
  return Array.from(byUrl.values());
}

function extractHtmlFromLoadMoreResponse(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return "";
  }

  const object = payload as Record<string, unknown>;
  const directKeys = ["html", "content", "output"];

  for (const key of directKeys) {
    const value = object[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  if (object.data && typeof object.data === "object") {
    return extractHtmlFromLoadMoreResponse(object.data);
  }

  return "";
}

async function fetchHtml(fetchImpl: FetchLike, url: string, init?: RequestInit): Promise<string> {
  const attempts = 4;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        ...init,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; musik-am-guertel-bot/1.0)",
          ...(init?.headers ?? {}),
        },
      });
      if (!response.ok) {
        throw new Error(`Carina fetch failed (${response.status}) for ${url}`);
      }
      return response.text();
    } catch (error) {
      const isLastAttempt = attempt === attempts;
      if (isLastAttempt || !shouldRetryFetch(error)) {
        throw error;
      }

      await sleep(250 * attempt);
    }
  }

  throw new Error(`Carina fetch exhausted retries for ${url}`);
}

async function fetchLoadMorePages(
  fetchImpl: FetchLike,
  firstPageHtml: string,
  sourceUrl: string,
): Promise<CarinaOverviewEvent[]> {
  const firstPageEvents = extractOverviewEventsFromHtml(firstPageHtml, sourceUrl);
  const combined: CarinaOverviewEvent[] = [...firstPageEvents];

  const $ = cheerio.load(firstPageHtml);
  const button = $(".mec-load-more-button").first();
  if (button.length === 0) {
    return uniqueByUrl(combined);
  }

  const maxPagesRaw = normalizeWhitespace(button.attr("data-max-page") ?? button.attr("data-max-pages") ?? "");
  const maxPages = Number(maxPagesRaw);
  const pageLimit = Number.isFinite(maxPages) && maxPages > 1 ? maxPages : 10;

  const ajaxUrl = normalizeWhitespace(button.attr("data-ajax-url") ?? "");
  const endpoint = ajaxUrl ? toAbsoluteUrl(ajaxUrl, sourceUrl) : new URL("/wp-admin/admin-ajax.php", sourceUrl).toString();
  const action = normalizeWhitespace(button.attr("data-action") ?? "mec_load_more");
  const skin = normalizeWhitespace(button.attr("data-skin") ?? button.attr("data-style") ?? "");
  const atts = normalizeWhitespace(button.attr("data-atts") ?? button.attr("data-settings") ?? "");

  let page = Number(normalizeWhitespace(button.attr("data-page") ?? "1"));
  if (!Number.isFinite(page) || page < 1) {
    page = 1;
  }

  for (let iteration = 0; iteration < pageLimit; iteration += 1) {
    page += 1;

    const body = new URLSearchParams();
    body.set("action", action);
    body.set("page", String(page));

    if (skin) {
      body.set("skin", skin);
    }
    if (atts) {
      body.set("atts", atts);
    }

    let responseHtml = "";
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest",
        },
        body,
      });

      if (!response.ok) {
        break;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const payload = (await response.json()) as unknown;
        responseHtml = extractHtmlFromLoadMoreResponse(payload);
      } else {
        responseHtml = await response.text();
      }
    } catch {
      break;
    }

    if (!responseHtml.trim()) {
      break;
    }

    const nextEvents = extractOverviewEventsFromHtml(responseHtml, sourceUrl);
    if (nextEvents.length === 0) {
      break;
    }

    const beforeCount = combined.length;
    combined.push(...nextEvents);
    const deduped = uniqueByUrl(combined);

    if (deduped.length === beforeCount) {
      break;
    }

    combined.length = 0;
    combined.push(...deduped);
  }

  return uniqueByUrl(combined);
}

async function mapToEvents(fetchImpl: FetchLike, overviewEvents: CarinaOverviewEvent[]): Promise<Event[]> {
  const result: Event[] = [];

  for (const entry of overviewEvents) {
    try {
      const detailHtml = await fetchHtml(fetchImpl, entry.url);
      const detailDescription = extractDescriptionFromDetailHtml(detailHtml);
      const detailDate = parseDateFromDetailHtml(detailHtml);
      const detailTitle = parseTitleFromDetailHtml(detailHtml, entry.title);
      const eventDate = detailDate ?? entry.date;

      if (!eventDate) {
        continue;
      }

      result.push({
        location: "Cafe Carina",
        title: detailTitle || entry.title,
        description: normalizeDescription(detailDescription),
        date: eventDate,
        time: "TBA",
        event_url: entry.url,
        ...(entry.image ? { image: entry.image } : {}),
      });
    } catch (error) {
      console.warn(`Skipping Carina detail due to fetch/parse error: ${entry.url}`, error);
    }
  }

  return result;
}

export async function scrapeCarinaEvents(fetchImpl: FetchLike = fetch): Promise<Event[]> {
  const firstPageHtml = await fetchHtml(fetchImpl, CARINA_PROGRAM_URL);
  const overviewEvents = uniqueByUrl(
    extractOverviewEventsFromHtml(firstPageHtml, CARINA_PROGRAM_URL),
  ).slice(0, CARINA_FIRST_PAGE_LIMIT);

  if (overviewEvents.length === 0) {
    throw new Error("Carina parser did not extract any overview events");
  }

  const events = await mapToEvents(fetchImpl, overviewEvents);

  if (events.length === 0) {
    throw new Error("Carina parser did not extract any detailed events");
  }

  return events;
}

export const __carinaInternals = {
  parseCarinaDateToIso,
  parseDateFromDetailHtml,
  parseTitleFromDetailHtml,
  extractOverviewEventsFromHtml,
  discoverRssUrlsFromProgramHtml,
  extractDescriptionFromDetailHtml,
  extractOverviewEventsFromRssXml,
  extractOverviewEventsFromRssHtml,
  extractLocUrlsFromXml,
  discoverEventUrlsViaWordPressSitemaps,
  extractHtmlFromLoadMoreResponse,
};
