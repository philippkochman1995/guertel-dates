import * as cheerio from "cheerio";
import { parseEuropeanDateToIso } from "../lib/date";
import { normalizeDescription, normalizeWhitespace } from "../lib/normalize";
import type { Event } from "../types";

export const LOFT_PROGRAM_URL = "https://www.theloft.at/programm/";

type FetchLike = typeof fetch;

type LoftOverviewEvent = {
  title: string;
  date: string;
  time: string;
  location: string;
  url: string;
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
  const normalized = normalizeWhitespace(value);
  const match = normalized.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return "TBA";
  }

  const hour = match[1].padStart(2, "0");
  const minute = match[2];
  return `${hour}:${minute}`;
}

function normalizeLoftLocation(value: string): string {
  const normalized = normalizeWhitespace(value).toLowerCase();
  const rooms: string[] = [];

  if (normalized.includes("oben")) {
    rooms.push("OBEN");
  }
  if (normalized.includes("unten")) {
    rooms.push("UNTEN");
  }
  if (normalized.includes("wohnzimmer")) {
    rooms.push("WOHNZIMMER");
  }

  if (rooms.length > 0) {
    return rooms.map((room) => `LOFT ${room}`).join(", ");
  }

  return "LOFT UNTEN";
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

function parseLoftDateToIso(value: string): string | null {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  const compactIsoMatch = normalized.match(/(\d{4})(\d{2})(\d{2})/);
  if (compactIsoMatch) {
    return `${compactIsoMatch[1]}-${compactIsoMatch[2]}-${compactIsoMatch[3]}`;
  }

  const longIsoMatch = normalized.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (longIsoMatch) {
    const month = String(Number(longIsoMatch[2])).padStart(2, "0");
    const day = String(Number(longIsoMatch[3])).padStart(2, "0");
    return `${longIsoMatch[1]}-${month}-${day}`;
  }

  return parseEuropeanDateToIso(normalized);
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

function uniqueByUrl(events: LoftOverviewEvent[]): LoftOverviewEvent[] {
  const byUrl = new Map<string, LoftOverviewEvent>();
  for (const event of events) {
    if (!byUrl.has(event.url)) {
      byUrl.set(event.url, event);
    }
  }
  return Array.from(byUrl.values());
}

function extractOverviewEventsFromHtml(html: string, sourceUrl: string): LoftOverviewEvent[] {
  const $ = cheerio.load(html);
  const events: LoftOverviewEvent[] = [];

  $("div.elementor-shortcode a[href]").each((_, node) => {
    const anchor = $(node);
    const row = anchor.find(".box-wrap").first();
    if (row.length === 0) {
      return;
    }

    const href = normalizeWhitespace(anchor.attr("href") ?? "");
    const title = normalizeWhitespace(row.find(".content-middle").first().text());
    const dateText = normalizeWhitespace(row.find(".datum").first().text());
    const location = normalizeLoftLocation(row.find(".content-right").first().text());
    const date = parseLoftDateToIso(dateText);
    const time = normalizeTime(parseTimeFromText(row.find(".open").first().text()));

    if (!href || !title || !date) {
      return;
    }

    events.push({
      title,
      date,
      time,
      location,
      url: toAbsoluteUrl(href, sourceUrl),
    });
  });

  return uniqueByUrl(events);
}

function extractTitleFromDetailHtml(html: string, fallbackTitle: string): string {
  const $ = cheerio.load(html);
  const headingTitle = normalizeWhitespace($("h1.elementor-heading-title").first().text());
  if (headingTitle) {
    return headingTitle;
  }

  const ogTitle = normalizeWhitespace($("meta[property='og:title']").attr("content") ?? "");
  if (ogTitle) {
    return ogTitle.replace(/\s*@\s*the\s+loft$/i, "").trim();
  }

  return fallbackTitle;
}

function extractDateTimeFromDetailHtml(
  html: string,
  fallback: Pick<LoftOverviewEvent, "date" | "time">,
): { date: string; time: string } {
  const $ = cheerio.load(html);
  const candidates: string[] = [];

  $("script[type='application/ld+json']").each((_, node) => {
    const raw = normalizeWhitespace($(node).text());
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      const eventNode = flattenJsonLd(parsed).find((entry) => isEventNode(entry));
      const startDate = normalizeWhitespace(String(eventNode?.startDate ?? ""));
      if (startDate) {
        candidates.push(startDate);
      }
    } catch {
      // Ignore malformed JSON-LD.
    }
  });

  candidates.push(
    normalizeWhitespace($("#datum-und-preis").first().text()),
    normalizeWhitespace($(".datum-container").first().text()),
  );

  let date = fallback.date;
  let time = fallback.time;

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const parsedDate = parseLoftDateToIso(candidate);
    if (parsedDate) {
      date = parsedDate;
      break;
    }
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const parsedTime = normalizeTime(parseTimeFromText(candidate));
    if (parsedTime !== "TBA") {
      time = parsedTime;
      break;
    }
  }

  return { date, time };
}

function extractDescriptionFromDetailHtml(html: string): string {
  const $ = cheerio.load(html);
  const container = $(".elementor-widget-theme-post-content .elementor-widget-container").first();
  if (container.length === 0) {
    return "";
  }

  return structuredTextFromHtml(container.html() ?? "");
}

function extractImageFromDetailHtml(html: string, sourceUrl: string): string {
  const $ = cheerio.load(html);

  const ogImage = normalizeWhitespace($("meta[property='og:image']").attr("content") ?? "");
  if (ogImage) {
    return toAbsoluteUrl(ogImage, sourceUrl);
  }

  const featuredImage = normalizeWhitespace(
    $(".elementor-widget-theme-post-featured-image img").first().attr("src") ?? "",
  );
  if (featuredImage) {
    return toAbsoluteUrl(featuredImage, sourceUrl);
  }

  return "";
}

function extractLocationFromDetailHtml(html: string): string {
  const $ = cheerio.load(html);
  return normalizeLoftLocation($("#datum-und-preis .elementor-post-info__terms-list-item").first().text());
}

function extractDetailEventData(html: string, overview: LoftOverviewEvent): Event | null {
  const $ = cheerio.load(html);
  const title = extractTitleFromDetailHtml(html, overview.title);
  const { date, time } = extractDateTimeFromDetailHtml(html, overview);
  const location = extractLocationFromDetailHtml(html) || overview.location || "LOFT UNTEN";
  const image = extractImageFromDetailHtml(html, overview.url);

  let description = extractDescriptionFromDetailHtml(html);
  if (!description) {
    description = normalizeDescription(
      normalizeWhitespace(
        $("meta[property='og:description']").attr("content")
          ?? $("meta[name='description']").attr("content")
          ?? "",
      ),
    );
  }

  if (!date || !title) {
    return null;
  }

  return {
    location,
    title,
    description,
    date,
    time,
    event_url: overview.url,
    ...(image ? { image } : {}),
  };
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
        throw new Error(`Loft fetch failed (${response.status}) for ${url}`);
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

export async function scrapeLoftEvents(fetchImpl: FetchLike = fetch): Promise<Event[]> {
  const overviewHtml = await fetchPage(fetchImpl, LOFT_PROGRAM_URL);
  if (!overviewHtml) {
    throw new Error("Loft parser failed to fetch program page");
  }

  const overviewEvents = extractOverviewEventsFromHtml(overviewHtml, LOFT_PROGRAM_URL);
  if (overviewEvents.length === 0) {
    throw new Error("Loft parser did not extract any overview events");
  }

  const detailedEvents: Event[] = [];
  for (const overviewEvent of overviewEvents) {
    try {
      const detailHtml = await fetchPage(fetchImpl, overviewEvent.url);
      if (!detailHtml) {
        continue;
      }

      const parsed = extractDetailEventData(detailHtml, overviewEvent);
      if (parsed) {
        detailedEvents.push(parsed);
      }
    } catch (error) {
      console.warn(`Skipping Loft detail due to fetch/parse error: ${overviewEvent.url}`, error);
    }
  }

  if (detailedEvents.length === 0) {
    throw new Error("Loft parser did not extract any detailed events");
  }

  return detailedEvents;
}

export const __loftInternals = {
  parseLoftDateToIso,
  parseTimeFromText,
  extractOverviewEventsFromHtml,
  extractDateTimeFromDetailHtml,
  extractDetailEventData,
};
