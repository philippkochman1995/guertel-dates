import * as cheerio from "cheerio";
import { parseEuropeanDateToIso } from "../lib/date";
import { normalizeDescription, normalizeWhitespace } from "../lib/normalize";
import type { Event } from "../types";

export const CONCERTO_PROGRAM_URL = "https://www.cafeconcerto.at/termine";

type FetchLike = typeof fetch;

type ConcertoOverviewEvent = {
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
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

function parseConcertoDateToIso(
  value: string,
  options?: {
    now?: Date;
  },
): string | null {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  const parsed = parseEuropeanDateToIso(normalized, options);
  if (parsed) {
    return parsed;
  }

  return null;
}

function parseTimeFromText(value: string): string {
  const normalized = normalizeWhitespace(value);
  const matches = Array.from(normalized.matchAll(/(?<!\d)([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/g));
  const match = matches[matches.length - 1];
  if (!match) {
    return "TBA";
  }

  const hour = match[1]?.padStart(2, "0") ?? "";
  const minute = match[2] ?? "";
  if (!hour || !minute) {
    return "TBA";
  }
  return `${hour}:${minute}`;
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

function extractLocationAndTime(value: string): { location: string; time: string } {
  const normalized = normalizeWhitespace(value);
  const time = parseTimeFromText(normalized);

  const locationCandidate = normalizeWhitespace(
    normalized
      .replace(/(?<!\d)([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/g, "")
      .replace(/^@/, "")
      .replace(/\s*@\s*/g, "")
      .trim(),
  );

  const normalizedLocation = normalizeConcertoLocation(locationCandidate);

  return {
    time,
    location: normalizedLocation,
  };
}

function normalizeConcertoLocation(value: string): string {
  const normalized = normalizeWhitespace(value).toLowerCase();

  if (normalized.includes("wintergarten")) {
    return "CAFE CONCERTO WINTERGARTEN";
  }
  if (normalized.includes("felsenkeller")) {
    return "CAFE CONCERTO FELSENKELLER";
  }

  return "CAFE CONCERTO";
}

function uniqueByUrl(events: ConcertoOverviewEvent[]): ConcertoOverviewEvent[] {
  const map = new Map<string, ConcertoOverviewEvent>();

  for (const event of events) {
    const key = `${event.url}|${event.date}|${event.time}|${event.title}`;
    if (!map.has(key)) {
      map.set(key, event);
    }
  }

  return Array.from(map.values());
}

function extractOverviewEventsFromHtml(html: string, sourceUrl: string): ConcertoOverviewEvent[] {
  const $ = cheerio.load(html);
  const events: ConcertoOverviewEvent[] = [];

  $(".item-list").each((_, groupNode) => {
    const group = $(groupNode);
    const dateHeader = normalizeWhitespace(group.find("h3 .date-display-single").first().text());
    const groupDate = parseConcertoDateToIso(dateHeader);

    group.find("li.views-row").each((__, rowNode) => {
      const row = $(rowNode);

      const title = normalizeWhitespace(
        row.find(".views-field-title h4 a").toArray()
          .map((anchor) => normalizeWhitespace($(anchor).text()))
          .find((candidate) => candidate.length > 0) ?? "",
      );
      if (!title) {
        return;
      }

      const titleLinks = row.find(".views-field-title a[href]").toArray();
      const primaryHref = normalizeWhitespace(
        $(titleLinks.find((anchor) => /\/event\//i.test($(anchor).attr("href") ?? "")) ?? titleLinks[0]).attr("href")
          ?? "",
      );
      if (!primaryHref) {
        return;
      }

      const locationAndTimeText = normalizeWhitespace(row.find(".views-field-field-raum .field-content").first().text());
      const parsedLocationAndTime = extractLocationAndTime(locationAndTimeText);

      const subtitle = normalizeWhitespace(row.find(".views-field-field-untertitel .field-content").first().text());
      const entry = normalizeWhitespace(row.find(".views-field-field-eintritt .field-content").first().text());
      const description = normalizeDescription([subtitle, entry].filter(Boolean).join("\n"));

      const imageRaw = normalizeWhitespace(
        row.find(".views-field-field-bild img").first().attr("src")
          ?? row.find(".views-field-field-bild img").first().attr("data-src")
          ?? "",
      );

      if (!groupDate) {
        return;
      }

      events.push({
        title,
        description,
        date: groupDate,
        time: parsedLocationAndTime.time,
        location: parsedLocationAndTime.location,
        url: toAbsoluteUrl(primaryHref, sourceUrl),
        ...(imageRaw ? { image: toAbsoluteUrl(imageRaw, sourceUrl) } : {}),
      });
    });
  });

  return uniqueByUrl(events);
}

function extractPaginationUrlsFromHtml(html: string, sourceUrl: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>([sourceUrl]);

  $(".pager a[href], li.pager-next a[href], li.pager-last a[href]").each((_, node) => {
    const href = normalizeWhitespace($(node).attr("href") ?? "");
    if (!href || !/page=\d+/i.test(href)) {
      return;
    }

    urls.add(toAbsoluteUrl(href, sourceUrl));
  });

  return Array.from(urls).sort((a, b) => {
    const aPage = Number(new URL(a).searchParams.get("page") ?? "0");
    const bPage = Number(new URL(b).searchParams.get("page") ?? "0");
    return aPage - bPage;
  });
}

function extractDetailEventData(html: string, overview: ConcertoOverviewEvent): Event | null {
  const $ = cheerio.load(html);

  const title =
    normalizeWhitespace($("h1.page-title").first().text()) ||
    normalizeWhitespace($("article.node h1").first().text()) ||
    overview.title;

  const dateTimeRaw = normalizeWhitespace($(".field-name-field-date .date-display-single").first().text());
  const date = parseConcertoDateToIso(dateTimeRaw) ?? overview.date;
  const time = parseTimeFromText(dateTimeRaw) !== "TBA" ? parseTimeFromText(dateTimeRaw) : overview.time;

  const location =
    normalizeConcertoLocation(
      normalizeWhitespace($(".field-name-field-raum .field-item").first().text()) ||
      overview.location,
    ) ||
    "CAFE CONCERTO";

  const subtitle = normalizeWhitespace($(".field-name-field-untertitel .field-item").first().text());
  const entry = normalizeWhitespace($(".field-name-field-eintritt .field-item").first().text());
  const bodyHtml = $(".field-name-body .field-item").first().html() ?? "";
  const lineupHtml = $(".field-name-field-lineup .field-item").first().html() ?? "";

  const body = bodyHtml ? structuredTextFromHtml(bodyHtml) : "";
  const lineup = lineupHtml ? structuredTextFromHtml(lineupHtml) : "";

  const descriptionParts = [
    subtitle,
    body,
    lineup ? `Lineup:\n${lineup}` : "",
    entry ? `Eintritt: ${entry}` : "",
  ].filter(Boolean);
  const description = normalizeDescription(descriptionParts.join("\n\n")) || overview.description;

  const imageRaw = normalizeWhitespace(
    $(".field-name-field-bild img").first().attr("src")
      ?? $("meta[property='og:image']").attr("content")
      ?? "",
  );
  const image = imageRaw ? toAbsoluteUrl(imageRaw, overview.url) : overview.image ?? "";

  if (!title || !date) {
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

function mapOverviewToEvent(overview: ConcertoOverviewEvent): Event {
  return {
    location: overview.location,
    title: overview.title,
    description: overview.description,
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
        throw new Error(`Concerto fetch failed (${response.status}) for ${url}`);
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

export async function scrapeConcertoEvents(fetchImpl: FetchLike = fetch): Promise<Event[]> {
  const programHtml = await fetchPage(fetchImpl, CONCERTO_PROGRAM_URL);
  if (!programHtml) {
    throw new Error("Concerto parser failed to fetch program page");
  }

  const pageUrls = extractPaginationUrlsFromHtml(programHtml, CONCERTO_PROGRAM_URL);
  const aggregated: ConcertoOverviewEvent[] = [];

  for (const pageUrl of pageUrls) {
    const pageHtml = pageUrl === CONCERTO_PROGRAM_URL ? programHtml : await fetchPage(fetchImpl, pageUrl);
    if (!pageHtml) {
      continue;
    }

    aggregated.push(...extractOverviewEventsFromHtml(pageHtml, pageUrl));
  }

  const overviewEvents = uniqueByUrl(aggregated);
  if (overviewEvents.length === 0) {
    throw new Error("Concerto parser did not extract any overview events");
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
      console.warn(`Skipping Concerto detail due to fetch/parse error: ${overviewEvent.url}`, error);
      detailedEvents.push(mapOverviewToEvent(overviewEvent));
    }
  }

  if (detailedEvents.length === 0) {
    throw new Error("Concerto parser did not extract any detailed events");
  }

  return detailedEvents;
}

export const __concertoInternals = {
  parseConcertoDateToIso,
  extractLocationAndTime,
  extractOverviewEventsFromHtml,
  extractPaginationUrlsFromHtml,
  extractDetailEventData,
};
