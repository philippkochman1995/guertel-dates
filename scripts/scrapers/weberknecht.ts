import * as cheerio from "cheerio";
import { normalizeDescription, normalizeWhitespace } from "../lib/normalize";
import type { Event } from "../types";

export const WEBERKNECHT_EVENTS_URL = "https://weberknecht.net/events/";

type FetchLike = typeof fetch;

type WeberknechtOverviewEvent = {
  title: string;
  url: string;
  date: string;
  time: string;
  description: string;
  image?: string;
};

type JsonLdEventNode = {
  name?: unknown;
  description?: unknown;
  image?: unknown;
  url?: unknown;
  startDate?: unknown;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toAbsoluteUrl(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

function normalizeTime(value: string): string {
  const match = normalizeWhitespace(value).match(/([01]?\d|2[0-3])[:.]([0-5]\d)/);
  if (!match) {
    return "TBA";
  }

  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function parseDateTime(value: string): { date?: string; time: string } {
  const normalized = normalizeWhitespace(value);
  const isoDateMatch = normalized.match(/(\d{4}-\d{2}-\d{2})/);
  const isoTimeMatch = normalized.match(/T([01]?\d|2[0-3]):([0-5]\d)/);
  const looseTimeMatch = normalized.match(/([01]?\d|2[0-3])[:.]([0-5]\d)/);

  const timeMatch = isoTimeMatch ?? looseTimeMatch;

  return {
    ...(isoDateMatch ? { date: isoDateMatch[1] } : {}),
    time: timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}` : "TBA",
  };
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

function isEventNode(node: Record<string, unknown>): boolean {
  const rawType = node["@type"];
  const values = Array.isArray(rawType) ? rawType : [rawType];
  return values.some((value) => normalizeWhitespace(String(value ?? "")).toLowerCase().includes("event"));
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => {
      const parsed = Number(code);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const parsed = Number.parseInt(code, 16);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : "";
    })
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
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

function descriptionFromJsonLd(value: string): string {
  const decoded = decodeHtmlEntities(value).replace(/\\n/g, "\n");
  return structuredTextFromHtml(decoded);
}

function extractPrimaryImage(value: unknown, sourceUrl: string): string {
  if (typeof value === "string") {
    const normalized = normalizeWhitespace(value);
    return normalized ? toAbsoluteUrl(normalized, sourceUrl) : "";
  }

  if (Array.isArray(value)) {
    for (const candidate of value) {
      if (typeof candidate !== "string") {
        continue;
      }
      const normalized = normalizeWhitespace(candidate);
      if (normalized) {
        return toAbsoluteUrl(normalized, sourceUrl);
      }
    }
  }

  return "";
}

function extractOverviewEventsFromHtml(html: string, sourceUrl: string): WeberknechtOverviewEvent[] {
  const $ = cheerio.load(html);
  const events: WeberknechtOverviewEvent[] = [];

  $(".tribe-events-calendar-list__event").each((_, node) => {
    const eventNode = $(node);
    const link = eventNode.find(".tribe-events-calendar-list__event-title-link").first();
    const href = normalizeWhitespace(link.attr("href") ?? "");
    const title = normalizeWhitespace(link.text());

    if (!href || !title) {
      return;
    }

    const date =
      normalizeWhitespace(eventNode.find(".tribe-events-calendar-list__event-datetime").first().attr("datetime") ?? "") ||
      normalizeWhitespace(eventNode.find(".tribe-events-calendar-list__event-date-tag-datetime").first().attr("datetime") ?? "");

    if (!date) {
      return;
    }

    const timeText = normalizeWhitespace(eventNode.find(".tribe-events-calendar-list__event-datetime").first().text());
    const teaser = normalizeWhitespace(eventNode.find(".tribe-events-calendar-list__event-description").first().text());
    const imageRaw = normalizeWhitespace(
      eventNode.find(".tribe-events-calendar-list__event-featured-image").first().attr("data-src")
        ?? eventNode.find(".tribe-events-calendar-list__event-featured-image").first().attr("src")
        ?? "",
    );

    events.push({
      title,
      url: toAbsoluteUrl(href, sourceUrl),
      date,
      time: normalizeTime(timeText),
      description: normalizeDescription(teaser),
      ...(imageRaw ? { image: toAbsoluteUrl(imageRaw, sourceUrl) } : {}),
    });
  });

  return uniqueByUrl(events);
}

function extractNextPageUrlFromHtml(html: string, sourceUrl: string): string | null {
  const $ = cheerio.load(html);
  const raw = $("script[data-js='tribe-events-view-data']").first().text().trim();
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { next_url?: string };
    const nextUrl = normalizeWhitespace(parsed.next_url ?? "");
    if (!nextUrl) {
      return null;
    }
    return toAbsoluteUrl(nextUrl, sourceUrl);
  } catch {
    return null;
  }
}

function extractJsonLdEventNode($: cheerio.CheerioAPI): JsonLdEventNode | null {
  const scripts = $("script[type='application/ld+json']").toArray();

  for (const script of scripts) {
    const raw = normalizeWhitespace($(script).text());
    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      const node = flattenJsonLd(parsed).find((entry) => isEventNode(entry));
      if (node) {
        return node as JsonLdEventNode;
      }
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }

  return null;
}

function extractDetailEventData(html: string, overview: WeberknechtOverviewEvent): Event {
  const $ = cheerio.load(html);
  const eventNode = extractJsonLdEventNode($);

  const jsonLdTitle = normalizeWhitespace(String(eventNode?.name ?? ""));
  const jsonLdDescription = normalizeWhitespace(String(eventNode?.description ?? ""));
  const jsonLdStart = normalizeWhitespace(String(eventNode?.startDate ?? ""));
  const jsonLdImage = extractPrimaryImage(eventNode?.image, overview.url);

  const heading = normalizeWhitespace($("h1.tribe-events-single-event-title").first().text());
  const ogTitle = normalizeWhitespace($("meta[property='og:title']").attr("content") ?? "");

  const descriptionHtml = $(".tribe-events-single-event-description").first().html() ?? "";
  const structuredDescription = structuredTextFromHtml(descriptionHtml);
  const ogDescription = normalizeWhitespace($("meta[property='og:description']").attr("content") ?? "");

  const detailImageRaw = normalizeWhitespace(
    $(".tribe-events-event-image img").first().attr("data-src")
      ?? $(".tribe-events-event-image img").first().attr("src")
      ?? $("meta[property='og:image']").attr("content")
      ?? "",
  );

  const dateFromAbbr = normalizeWhitespace(
    $(".tribe-events-start-datetime").first().attr("title")
      ?? $(".tribe-events-calendar-list__event-datetime").first().attr("datetime")
      ?? "",
  );
  const dateFromJsonLd = parseDateTime(jsonLdStart).date;
  const timeFromMetaText = normalizeTime(
    normalizeWhitespace(
      $(".tribe-events-start-datetime").first().text()
        || $(".tribe-events-schedule").first().text(),
    ),
  );
  const timeFromJsonLd = parseDateTime(jsonLdStart).time;

  const image = detailImageRaw
    ? toAbsoluteUrl(detailImageRaw, overview.url)
    : jsonLdImage || overview.image || "";

  const description =
    structuredDescription
    || descriptionFromJsonLd(jsonLdDescription)
    || normalizeDescription(ogDescription)
    || overview.description;

  return {
    location: "Weberknecht",
    title: heading || jsonLdTitle || ogTitle || overview.title,
    description,
    date: dateFromAbbr || dateFromJsonLd || overview.date,
    time: timeFromMetaText !== "TBA" ? timeFromMetaText : timeFromJsonLd || overview.time,
    event_url: overview.url,
    ...(image ? { image } : {}),
  };
}

function uniqueByUrl(events: WeberknechtOverviewEvent[]): WeberknechtOverviewEvent[] {
  const byUrl = new Map<string, WeberknechtOverviewEvent>();

  for (const event of events) {
    if (!byUrl.has(event.url)) {
      byUrl.set(event.url, event);
    }
  }

  return Array.from(byUrl.values());
}

async function fetchPage(fetchImpl: FetchLike, url: string): Promise<string | null> {
  const attempts = 3;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; musik-am-guertel-bot/1.0)",
        },
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Weberknecht fetch failed (${response.status}) for ${url}`);
      }

      return response.text();
    } catch (error) {
      if (attempt === attempts) {
        throw error;
      }
      await sleep(200 * attempt);
    }
  }

  return null;
}

export async function scrapeWeberknechtEvents(fetchImpl: FetchLike = fetch): Promise<Event[]> {
  const aggregated: WeberknechtOverviewEvent[] = [];
  const visitedUrls = new Set<string>();
  let currentUrl: string | null = WEBERKNECHT_EVENTS_URL;

  while (currentUrl && !visitedUrls.has(currentUrl)) {
    visitedUrls.add(currentUrl);

    const html = await fetchPage(fetchImpl, currentUrl);
    if (!html) {
      break;
    }

    const pageEvents = extractOverviewEventsFromHtml(html, currentUrl);
    if (pageEvents.length === 0) {
      break;
    }

    aggregated.push(...pageEvents);
    currentUrl = extractNextPageUrlFromHtml(html, currentUrl);
  }

  const overviewEvents = uniqueByUrl(aggregated);
  if (overviewEvents.length === 0) {
    throw new Error("Weberknecht parser did not extract any overview events");
  }

  const events: Event[] = [];

  for (const overviewEvent of overviewEvents) {
    try {
      const detailHtml = await fetchPage(fetchImpl, overviewEvent.url);
      if (!detailHtml) {
        continue;
      }
      events.push(extractDetailEventData(detailHtml, overviewEvent));
    } catch (error) {
      console.warn(`Skipping Weberknecht detail due to fetch/parse error: ${overviewEvent.url}`, error);
    }
  }

  if (events.length === 0) {
    throw new Error("Weberknecht parser did not extract any detailed events");
  }

  return events;
}

export const __weberknechtInternals = {
  parseDateTime,
  extractOverviewEventsFromHtml,
  extractNextPageUrlFromHtml,
  extractDetailEventData,
};
