import * as cheerio from "cheerio";
import { parseEuropeanDateToIso } from "../lib/date";
import { normalizeDescription, normalizeWhitespace } from "../lib/normalize";
import type { Event } from "../types";

export const LUCIA_BASE_URL = "https://www.clublucia.at/de/veranstaltungen/";

type FetchLike = typeof fetch;

type LuciaOverviewEvent = {
  title: string;
  url: string;
  date?: string;
  image?: string;
};

const GERMAN_MONTHS: Record<string, string> = {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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

function parseLuciaDateToIso(value: string): string | null {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  const isoMatch = normalized.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const direct = parseEuropeanDateToIso(normalized);
  if (direct) {
    return direct;
  }

  const match = normalized.match(/(\d{1,2})[.\s]+([A-Za-zÄÖÜäöüß]+)[.\s]+(\d{4})/);
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

function parseTimeFromText(value: string): string {
  const normalized = normalizeWhitespace(value);
  const match = normalized.match(/(?<!\d)([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/);
  if (!match) {
    return "TBA";
  }

  const hour = match[1].padStart(2, "0");
  const minute = match[2];
  return `${hour}:${minute}`;
}

function flattenJsonLd(input: unknown): Record<string, unknown>[] {
  if (Array.isArray(input)) {
    return input.flatMap(flattenJsonLd);
  }

  if (!input || typeof input !== "object") {
    return [];
  }

  const object = input as Record<string, unknown>;
  const graph = object["@graph"];
  if (Array.isArray(graph)) {
    return graph.flatMap(flattenJsonLd);
  }

  return [object];
}

function extractDateTimeFromJsonLd($: cheerio.CheerioAPI): { date?: string; time?: string } {
  const scripts = $("script[type='application/ld+json']").toArray();

  for (const script of scripts) {
    const raw = normalizeWhitespace($(script).text());
    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      const nodes = flattenJsonLd(parsed);

      for (const node of nodes) {
        const type = normalizeWhitespace(String(node["@type"] ?? "")).toLowerCase();
        if (!type.includes("event")) {
          continue;
        }

        const startDate = normalizeWhitespace(String(node.startDate ?? ""));
        if (!startDate) {
          continue;
        }

        return {
          date: parseLuciaDateToIso(startDate) ?? undefined,
          time: parseTimeFromText(startDate),
        };
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }

  return {};
}

function structuredTextFromHtml(html: string): string {
  const prepared = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<\/div\s*>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/li\s*>/gi, "\n");

  const text = cheerio.load(`<div>${prepared}</div>`)("div").text();
  return normalizeDescription(text);
}

async function fetchPage(
  fetchImpl: FetchLike,
  url: string,
  options?: {
    retries?: number;
    throwOn404?: boolean;
  },
): Promise<string | null> {
  const retries = options?.retries ?? 3;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; musik-am-guertel-bot/1.0)",
        },
      });

      if (response.status === 404 && options?.throwOn404 !== true) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Lucia fetch failed (${response.status}) for ${url}`);
      }

      return response.text();
    } catch (error) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        throw error;
      }
      await sleep(200 * attempt);
    }
  }

  return null;
}

function extractOverviewEventsFromHtml(html: string, sourceUrl: string): LuciaOverviewEvent[] {
  const $ = cheerio.load(html);
  const items = $(".event_listing").toArray();
  const events: LuciaOverviewEvent[] = [];

  for (const item of items) {
    const node = $(item);
    const anchor = node.find("h3 a").first();
    const title = normalizeWhitespace(anchor.text());
    const href = normalizeWhitespace(anchor.attr("href") ?? "");

    if (!title || !href) {
      continue;
    }

    const dateCandidates = [
      normalizeWhitespace(node.find(".event-date").first().text()),
      normalizeWhitespace(node.find("time").first().text()),
      normalizeWhitespace(node.find(".event-meta").first().text()),
      normalizeWhitespace(node.text()),
    ];

    let date: string | undefined;
    for (const candidate of dateCandidates) {
      const parsed = parseLuciaDateToIso(candidate);
      if (parsed) {
        date = parsed;
        break;
      }
    }

    const imageNode = node.find("img").first();
    const imageRaw = normalizeWhitespace(imageNode.attr("src") ?? imageNode.attr("data-src") ?? "");

    events.push({
      title,
      url: toAbsoluteUrl(href, sourceUrl),
      date,
      image: imageRaw ? toAbsoluteUrl(imageRaw, sourceUrl) : undefined,
    });
  }

  return events;
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

function extractOverviewEventsFromAnchorFallback(html: string, sourceUrl: string): LuciaOverviewEvent[] {
  const $ = cheerio.load(html);
  const events: LuciaOverviewEvent[] = [];

  $("a[href]").each((_, node) => {
    const anchor = $(node);
    const href = normalizeWhitespace(anchor.attr("href") ?? "");
    if (!href) {
      return;
    }

    const absoluteUrl = toAbsoluteUrl(href, sourceUrl);
    if (!/\/(?:de\/)?event\//i.test(absoluteUrl)) {
      return;
    }

    const anchorTitle = normalizeWhitespace(anchor.text());
    const title = anchorTitle || titleFromEventUrl(absoluteUrl);
    if (!title) {
      return;
    }

    events.push({
      title,
      url: absoluteUrl,
    });
  });

  return dedupeOverviewEventsByUrl(events);
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
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

async function discoverEventUrlsViaWordPressSitemaps(fetchImpl: FetchLike): Promise<string[]> {
  const indexUrl = new URL("wp-sitemap.xml", LUCIA_SITE_ROOT).toString();
  const indexXml = await fetchPage(fetchImpl, indexUrl, { retries: 3, throwOn404: true });
  if (!indexXml) {
    return [];
  }

  const sitemapUrls = extractLocUrlsFromXml(indexXml, indexUrl)
    .filter((url) => /sitemap/i.test(url))
    .sort((a, b) => {
      const aLooksEvent = /(event|wp-sitemap-posts|mec)/i.test(a);
      const bLooksEvent = /(event|wp-sitemap-posts|mec)/i.test(b);
      if (aLooksEvent && !bLooksEvent) return -1;
      if (!aLooksEvent && bLooksEvent) return 1;
      return 0;
    })
    .slice(0, 25);

  const eventUrls = new Set<string>();

  for (const sitemapUrl of sitemapUrls) {
    const xml = await fetchPage(fetchImpl, sitemapUrl);
    if (!xml) {
      continue;
    }

    const urls = extractLocUrlsFromXml(xml, sitemapUrl);
    for (const url of urls) {
      if (/\/(?:de\/)?event\//i.test(url)) {
        eventUrls.add(url);
      }
    }
  }

  return Array.from(eventUrls);
}

function extractDetailEventData(html: string, overview: LuciaOverviewEvent): Event | null {
  const $ = cheerio.load(html);
  const jsonLdDateTime = extractDateTimeFromJsonLd($);

  const ogTitle = normalizeWhitespace($("meta[property='og:title']").attr("content") ?? "");
  const ogDescription = normalizeWhitespace($("meta[property='og:description']").attr("content") ?? "");
  const ogImage = normalizeWhitespace($("meta[property='og:image']").attr("content") ?? "");
  const featuredImage = normalizeWhitespace(
    $(".wp-post-image, .post-thumbnail img, .entry-content img").first().attr("src")
      ?? $(".wp-post-image, .post-thumbnail img, .entry-content img").first().attr("data-src")
      ?? "",
  );
  const detailImageRaw = overview.image || ogImage || featuredImage;
  const detailImage = detailImageRaw ? toAbsoluteUrl(detailImageRaw, overview.url) : "";

  const title =
    normalizeWhitespace($("h1").first().text()) ||
    normalizeWhitespace($(".entry-title").first().text()) ||
    ogTitle ||
    overview.title;

  const dateCandidates = [
    normalizeWhitespace($(".wpem-event-date").first().text()),
    normalizeWhitespace($(".wpem-event-date-time").first().text()),
    normalizeWhitespace($(".event-date").first().text()),
    normalizeWhitespace($("time").first().attr("datetime") ?? ""),
    normalizeWhitespace($("time").first().text()),
    normalizeWhitespace($(".event-meta").first().text()),
  ];

  let date = jsonLdDateTime.date ?? overview.date;
  for (const candidate of dateCandidates) {
    const parsed = parseLuciaDateToIso(candidate);
    if (parsed) {
      date = parsed;
      break;
    }
  }

  if (!date) {
    return null;
  }

  const timeCandidates = [
    normalizeWhitespace($(".wpem-event-date-time").first().text()),
    normalizeWhitespace($(".wpem-event-time").first().text()),
    normalizeWhitespace($("time").first().attr("datetime") ?? ""),
    normalizeWhitespace($("time").first().text()),
    normalizeWhitespace($(".event-meta").first().text()),
  ];

  let time = jsonLdDateTime.time && jsonLdDateTime.time !== "TBA" ? jsonLdDateTime.time : "TBA";
  for (const candidate of timeCandidates) {
    const parsedTime = parseTimeFromText(candidate);
    if (parsedTime !== "TBA") {
      time = parsedTime;
      break;
    }
  }

  const descriptionContainer = $(".entry-content").first().length
    ? $(".entry-content").first()
    : $(".event-description").first();

  let description = "";
  if (descriptionContainer.length > 0) {
    description = structuredTextFromHtml(descriptionContainer.html() ?? "");
  }

  if (!description) {
    description = normalizeDescription(ogDescription);
  }

  if (!description && overview.image) {
    description = `Image: ${overview.image}`;
  }

  if (!description && ogImage) {
    description = `Image: ${ogImage}`;
  }

  return {
    location: "Club Lucia",
    title,
    description,
    date,
    time,
    event_url: overview.url,
    ...(detailImage ? { image: detailImage } : {}),
  };
}

function dedupeOverviewEventsByUrl(events: LuciaOverviewEvent[]): LuciaOverviewEvent[] {
  const map = new Map<string, LuciaOverviewEvent>();

  for (const event of events) {
    if (!map.has(event.url)) {
      map.set(event.url, event);
    }
  }

  return Array.from(map.values());
}

function getPaginationUrl(page: number): string {
  if (page <= 1) {
    return LUCIA_BASE_URL;
  }

  return new URL(`page/${page}/`, LUCIA_BASE_URL).toString();
}

async function scrapeOverviewWithPagination(fetchImpl: FetchLike): Promise<LuciaOverviewEvent[]> {
  const html = await fetchPage(fetchImpl, LUCIA_BASE_URL);
  if (!html) {
    return [];
  }

  // Only the first visible batch (before "Load more").
  const primary = dedupeOverviewEventsByUrl(extractOverviewEventsFromHtml(html, LUCIA_BASE_URL));
  if (primary.length > 0) {
    return primary;
  }

  return dedupeOverviewEventsByUrl(
    extractOverviewEventsFromAnchorFallback(html, LUCIA_BASE_URL),
  );
}

export async function scrapeLuciaEvents(fetchImpl: FetchLike = fetch): Promise<Event[]> {
  const overviewEvents = await scrapeOverviewWithPagination(fetchImpl);

  if (overviewEvents.length === 0) {
    throw new Error("Lucia parser did not extract any overview events");
  }

  const events: Event[] = [];

  for (const overviewEvent of overviewEvents) {
    try {
      const detailHtml = await fetchPage(fetchImpl, overviewEvent.url, {
        retries: 4,
        throwOn404: true,
      });

      if (!detailHtml) {
        continue;
      }

      const parsed = extractDetailEventData(detailHtml, overviewEvent);
      if (parsed) {
        events.push(parsed);
      }
    } catch (error) {
      console.warn(`Skipping Lucia detail due to fetch/parse error: ${overviewEvent.url}`, error);
    }
  }

  if (events.length === 0) {
    throw new Error("Lucia parser did not extract any detailed events");
  }

  return events;
}

export const __luciaInternals = {
  parseLuciaDateToIso,
  parseTimeFromText,
  extractOverviewEventsFromHtml,
  extractOverviewEventsFromAnchorFallback,
  extractLocUrlsFromXml,
  extractDetailEventData,
  getPaginationUrl,
};
