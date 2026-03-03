import * as cheerio from "cheerio";
import { normalizeDescription, normalizeWhitespace } from "../lib/normalize";
import type { Event } from "../types";

export const B72_PROGRAM_URL = "https://www.b72.at/program";

type FetchLike = typeof fetch;

type B72OverviewEvent = {
  title: string;
  date: string;
  time: string;
  url: string;
  image?: string;
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

function parseB72DateToIso(value: string, fallbackYear?: number): string | null {
  const normalized = normalizeWhitespace(value);
  const fullDateMatch = normalized.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/);
  if (fullDateMatch) {
    const day = Number(fullDateMatch[1]);
    const month = Number(fullDateMatch[2]);
    const rawYear = Number(fullDateMatch[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000 || year > 2100) {
      return null;
    }
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const dayMonthMatch = normalized.match(/(\d{1,2})[.\-/](\d{1,2})/);
  if (!dayMonthMatch || !fallbackYear) {
    return null;
  }

  const day = Number(dayMonthMatch[1]);
  const month = Number(dayMonthMatch[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return null;
  }

  return `${String(fallbackYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseB72Time(value: string): string {
  const normalized = normalizeWhitespace(value);
  const matches = Array.from(normalized.matchAll(/([01]?\d|2[0-3])[:.]([0-5]\d)/g));
  const match = matches.at(-1);
  if (!match) {
    return "TBA";
  }
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function extractCurrentProgramYear(html: string): number | null {
  const $ = cheerio.load(html);
  const selectedYear = normalizeWhitespace($(".section .row b a[href*='/program/']").first().text());
  if (selectedYear && /^\d{4}$/.test(selectedYear)) {
    return Number(selectedYear);
  }

  const selectedHref = normalizeWhitespace(
    $(".section .row b a[href*='/program/']").first().attr("href")
      ?? "",
  );
  const hrefMatch = selectedHref.match(/\/program\/(\d{4})\/?/);
  if (hrefMatch) {
    return Number(hrefMatch[1]);
  }

  return null;
}

function extractImageFromStyle(value: string, sourceUrl: string): string {
  const normalized = normalizeWhitespace(value);
  const match = normalized.match(/url\((['"]?)(.*?)\1\)/i);
  if (!match) {
    return "";
  }

  const url = normalizeWhitespace(match[2] ?? "");
  if (!url || /\/img\/no-image\.jpg$/i.test(url)) {
    return "";
  }

  return toAbsoluteUrl(url, sourceUrl);
}

function uniqueByUrl(events: B72OverviewEvent[]): B72OverviewEvent[] {
  const byUrl = new Map<string, B72OverviewEvent>();
  for (const event of events) {
    if (!byUrl.has(event.url)) {
      byUrl.set(event.url, event);
    }
  }
  return Array.from(byUrl.values());
}

function extractOverviewEventsFromHtml(html: string, sourceUrl: string): B72OverviewEvent[] {
  const $ = cheerio.load(html);
  const year = extractCurrentProgramYear(html);
  const events: B72OverviewEvent[] = [];

  $(".coming-up").each((_, node) => {
    const card = $(node);
    const titleAnchor = card.find("h6 a[href]").first();
    const title = normalizeWhitespace(titleAnchor.text());
    const href = normalizeWhitespace(titleAnchor.attr("href") ?? card.find("a[href]").first().attr("href") ?? "");
    const dateText = normalizeWhitespace(card.find("h4").first().text());
    const date = parseB72DateToIso(dateText, year ?? undefined);
    const image = extractImageFromStyle(card.find(".bg-image").first().attr("style") ?? "", sourceUrl);

    if (!title || !href || !date) {
      return;
    }

    events.push({
      title,
      date,
      time: "TBA",
      url: toAbsoluteUrl(href, sourceUrl),
      ...(image ? { image } : {}),
    });
  });

  return uniqueByUrl(events);
}

function extractDescriptionFromDetailHtml(html: string): string {
  const $ = cheerio.load(html);
  const paragraphs: string[] = [];

  $(".section p").each((_, node) => {
    const paragraph = $(node);
    if (paragraph.closest("form").length > 0) {
      return;
    }

    const text = normalizeWhitespace(paragraph.text());
    if (!text) {
      return;
    }

    paragraphs.push(text);
  });

  if (paragraphs.length === 0) {
    return "";
  }

  return normalizeDescription(paragraphs.join("\n\n"));
}

function extractDetailEventData(html: string, overview: B72OverviewEvent): Event | null {
  const $ = cheerio.load(html);

  const title = normalizeWhitespace($(".show-detail h1").first().text()) || overview.title;

  const dateText = normalizeWhitespace(
    $(".show-detail .date").first().text()
      || $(".show-detail b").first().text()
      || "",
  );
  const date = parseB72DateToIso(dateText) || overview.date;
  const time = parseB72Time($(".show-detail b").first().text() || "");

  const imageRaw = normalizeWhitespace(
    $(".section img.responsive-img").first().attr("src")
      ?? $("meta[property='og:image']").attr("content")
      ?? "",
  );
  const image = imageRaw ? toAbsoluteUrl(imageRaw, overview.url) : overview.image ?? "";

  const description = extractDescriptionFromDetailHtml(html);

  if (!title || !date) {
    return null;
  }

  return {
    location: "B72",
    title,
    description,
    date,
    time: time === "TBA" ? overview.time : time,
    event_url: overview.url,
    ...(image ? { image } : {}),
  };
}

function mapOverviewToEvent(overview: B72OverviewEvent): Event {
  return {
    location: "B72",
    title: overview.title,
    description: "",
    date: overview.date,
    time: overview.time,
    event_url: overview.url,
    ...(overview.image ? { image: overview.image } : {}),
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
        throw new Error(`B72 fetch failed (${response.status}) for ${url}`);
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

export async function scrapeB72Events(fetchImpl: FetchLike = fetch): Promise<Event[]> {
  const overviewHtml = await fetchPage(fetchImpl, B72_PROGRAM_URL);
  if (!overviewHtml) {
    throw new Error("B72 parser failed to fetch program page");
  }

  const overviewEvents = extractOverviewEventsFromHtml(overviewHtml, B72_PROGRAM_URL);
  if (overviewEvents.length === 0) {
    throw new Error("B72 parser did not extract any overview events");
  }

  const detailedEvents: Event[] = [];
  for (const overviewEvent of overviewEvents) {
    try {
      const detailHtml = await fetchPage(fetchImpl, overviewEvent.url);
      if (!detailHtml) {
        detailedEvents.push(mapOverviewToEvent(overviewEvent));
        continue;
      }

      const parsed = extractDetailEventData(detailHtml, overviewEvent);
      detailedEvents.push(parsed ?? mapOverviewToEvent(overviewEvent));
    } catch (error) {
      console.warn(`Skipping B72 detail due to fetch/parse error: ${overviewEvent.url}`, error);
      detailedEvents.push(mapOverviewToEvent(overviewEvent));
    }
  }

  if (detailedEvents.length === 0) {
    throw new Error("B72 parser did not extract any detailed events");
  }

  return detailedEvents;
}

export const __b72Internals = {
  parseB72DateToIso,
  parseB72Time,
  extractCurrentProgramYear,
  extractImageFromStyle,
  extractOverviewEventsFromHtml,
  extractDescriptionFromDetailHtml,
  extractDetailEventData,
};
