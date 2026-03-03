import * as cheerio from "cheerio";
import { normalizeDescription, normalizeWhitespace } from "../lib/normalize";
import type { Event } from "../types";

export const LOOP_LIST_URL = "https://loop.co.at/events/liste/";

type FetchLike = typeof fetch;

type LoopOverviewEvent = {
  title: string;
  description: string;
  date: string;
  time: string;
  url: string;
  image?: string;
  location?: string;
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
  const match = value.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return "TBA";
  }
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function parseDateTime(value: string): { date?: string; time: string } {
  const normalized = normalizeWhitespace(value);
  const dateMatch = normalized.match(/(\d{4}-\d{2}-\d{2})/);
  const timeMatch = normalized.match(/T([01]\d|2[0-3]):([0-5]\d)/);

  return {
    ...(dateMatch ? { date: dateMatch[1] } : {}),
    time: timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : "TBA",
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

function htmlToText(value: string): string {
  const decoded = decodeHtmlEntities(value).replace(/\\n/g, "\n");
  const prepared = decoded
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<\/div\s*>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/li\s*>/gi, "\n");
  const text = cheerio.load(`<div>${prepared}</div>`)("div").text();
  return normalizeDescription(text);
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

function extractPrimaryImage(value: unknown, sourceUrl: string): string {
  if (typeof value === "string") {
    return toAbsoluteUrl(normalizeWhitespace(value), sourceUrl);
  }

  if (Array.isArray(value)) {
    for (const candidate of value) {
      if (typeof candidate === "string" && normalizeWhitespace(candidate)) {
        return toAbsoluteUrl(candidate, sourceUrl);
      }
    }
  }

  return "";
}

function isEventNode(node: Record<string, unknown>): boolean {
  const rawType = node["@type"];
  const values = Array.isArray(rawType) ? rawType : [rawType];
  return values.some((value) => normalizeWhitespace(String(value ?? "")).toLowerCase().includes("event"));
}

function extractOverviewEventsFromHtml(html: string, sourceUrl: string): LoopOverviewEvent[] {
  const $ = cheerio.load(html);
  const scripts = $("script[type='application/ld+json']").toArray();
  const events: LoopOverviewEvent[] = [];

  for (const script of scripts) {
    const raw = $(script).text().trim();
    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      const nodes = flattenJsonLd(parsed);

      for (const node of nodes) {
        if (!isEventNode(node)) {
          continue;
        }

        const title = normalizeWhitespace(String(node.name ?? ""));
        const url = normalizeWhitespace(String(node.url ?? ""));
        const descriptionRaw = String(node.description ?? "");
        const startDateRaw = normalizeWhitespace(String(node.startDate ?? ""));
        const locationValue = node.location;
        const locationName = locationValue && typeof locationValue === "object"
          ? normalizeWhitespace(String((locationValue as Record<string, unknown>).name ?? ""))
          : "";
        const { date, time } = parseDateTime(startDateRaw);

        if (!title || !url || !date) {
          continue;
        }

        events.push({
          title,
          description: htmlToText(descriptionRaw),
          date,
          time: normalizeTime(time),
          url: toAbsoluteUrl(url, sourceUrl),
          image: extractPrimaryImage(node.image, sourceUrl),
          location: locationName,
        });
      }
    } catch {
      // Ignore malformed JSON-LD chunks.
    }
  }

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

function uniqueByUrl(events: LoopOverviewEvent[]): LoopOverviewEvent[] {
  const byUrl = new Map<string, LoopOverviewEvent>();
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
        throw new Error(`Loop fetch failed (${response.status}) for ${url}`);
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

function mapToEvents(overviewEvents: LoopOverviewEvent[]): Event[] {
  return overviewEvents.map((entry) => ({
    location: entry.location || "Loop",
    title: entry.title,
    description: entry.description,
    date: entry.date,
    time: entry.time,
    event_url: entry.url,
    ...(entry.image ? { image: entry.image } : {}),
  }));
}

export async function scrapeLoopEvents(fetchImpl: FetchLike = fetch): Promise<Event[]> {
  const aggregated: LoopOverviewEvent[] = [];
  const visitedUrls = new Set<string>();
  let currentUrl: string | null = LOOP_LIST_URL;

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
    throw new Error("Loop parser did not extract any overview events");
  }

  return mapToEvents(overviewEvents);
}

export const __loopInternals = {
  parseDateTime,
  extractOverviewEventsFromHtml,
  extractNextPageUrlFromHtml,
};
