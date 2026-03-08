import * as cheerio from "cheerio";
import { getTodayISOInTimeZone, VIENNA_TIME_ZONE } from "../lib/date";
import { normalizeDescription, normalizeWhitespace } from "../lib/normalize";
import type { Event } from "../types";

export const G5_ALL_EVENTS_URL = "https://g5musicgroup.at/all-events/";
const CANONICAL_G5_LOCATION = "G5 – Live Music Bar";

type FetchLike = typeof fetch;

type G5OverviewEvent = {
  title: string;
  url: string;
  date: string;
  time: string;
  location: string;
  description: string;
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

function toAbsoluteUrl(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

function normalizeMonthKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase();
}

function toIsoDateFromParts(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function parseG5DateToIso(
  value: string,
  options?: {
    now?: Date;
  },
): string | null {
  const normalized = normalizeWhitespace(value).replace(/,\s*$/, "");
  if (!normalized) {
    return null;
  }

  const withYearMatch = normalized.match(/(\d{1,2})\s+([A-Za-zÄÖÜäöüß]+)\s+(\d{4})/);
  if (withYearMatch) {
    const day = Number(withYearMatch[1]);
    const month = Number(GERMAN_MONTHS[normalizeMonthKey(withYearMatch[2])]);
    const year = Number(withYearMatch[3]);

    if (!day || !month || !year) {
      return null;
    }
    return toIsoDateFromParts(year, month, day);
  }

  const withoutYearMatch = normalized.match(/(\d{1,2})\s+([A-Za-zÄÖÜäöüß]+)/);
  if (!withoutYearMatch) {
    return null;
  }

  const day = Number(withoutYearMatch[1]);
  const month = Number(GERMAN_MONTHS[normalizeMonthKey(withoutYearMatch[2])]);
  if (!day || !month) {
    return null;
  }

  const now = options?.now ?? new Date();
  const todayIso = getTodayISOInTimeZone(VIENNA_TIME_ZONE, now);
  const currentYear = Number(todayIso.slice(0, 4));
  const thisYearDate = toIsoDateFromParts(currentYear, month, day);
  if (thisYearDate >= todayIso) {
    return thisYearDate;
  }

  return toIsoDateFromParts(currentYear + 1, month, day);
}

function parseG5Time(value: string): string {
  const normalized = normalizeWhitespace(value);
  const match = normalized.match(/([01]?\d):([0-5]\d)\s*(AM|PM)?/i);
  if (!match) {
    return "TBA";
  }

  let hours = Number(match[1]);
  const minutes = match[2];
  const meridiem = (match[3] ?? "").toUpperCase();

  if (meridiem === "PM" && hours < 12) {
    hours += 12;
  }
  if (meridiem === "AM" && hours === 12) {
    hours = 0;
  }

  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

function normalizeG5Location(value: string): string {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return CANONICAL_G5_LOCATION;
  }

  if (/^u4\b/i.test(normalized)) {
    return CANONICAL_G5_LOCATION;
  }

  if (/^g5\b/i.test(normalized)) {
    return CANONICAL_G5_LOCATION;
  }

  return normalized;
}

function extractMaxPagesFromHtml(html: string): number {
  const $ = cheerio.load(html);
  const raw = normalizeWhitespace($("#ep-loadmore-events").attr("data-max") ?? "");
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function extractOverviewEventsFromHtml(html: string, sourceUrl: string): G5OverviewEvent[] {
  const $ = cheerio.load(html);
  const events: G5OverviewEvent[] = [];

  $(".ep-event-list-item").each((_, node) => {
    const item = $(node);
    const anchor = item.find("a.ep-fs-5[data-event-id][href]").first();

    const title = normalizeWhitespace(anchor.text());
    const href = normalizeWhitespace(anchor.attr("href") ?? "");
    const dateText = normalizeWhitespace(item.find(".ep-event-date").first().text());
    const timeText = normalizeWhitespace(item.find(".ep-event-list-view-action span").last().text());

    const date = parseG5DateToIso(dateText);
    const time = parseG5Time(timeText);

    if (!title || !href || !date) {
      return;
    }

    const location = normalizeG5Location(
      normalizeWhitespace(item.find(".ep-text-muted").first().text()) ||
      CANONICAL_G5_LOCATION,
    );

    const description = normalizeDescription(
      normalizeWhitespace(item.find(".ep-box-list-desc").first().text()),
    );

    const imageRaw = normalizeWhitespace(item.find("img").first().attr("src") ?? "");
    const image = imageRaw.includes("dummy_image.png") ? "" : toAbsoluteUrl(imageRaw, sourceUrl);

    events.push({
      title,
      url: toAbsoluteUrl(href, sourceUrl),
      date,
      time,
      location,
      description,
      ...(image ? { image } : {}),
    });
  });

  return uniqueByUrl(events);
}

function uniqueByUrl(events: G5OverviewEvent[]): G5OverviewEvent[] {
  const map = new Map<string, G5OverviewEvent>();
  for (const event of events) {
    if (!map.has(event.url)) {
      map.set(event.url, event);
    }
  }
  return Array.from(map.values());
}

function dateTimeFromUnixSeconds(secondsRaw: unknown): { date?: string; time: string } {
  const seconds = Number(secondsRaw);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return { time: "TBA" };
  }

  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) {
    return { time: "TBA" };
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: VIENNA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "";

  if (!year || !month || !day || !hour || !minute) {
    return { time: "TBA" };
  }

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
  };
}

function extractObjectFromScript(script: string): Record<string, unknown> | null {
  const match = script.match(/var\s+em_front_event_object\s*=\s*(\{[\s\S]*?\});/);
  if (!match?.[1]) {
    return null;
  }

  try {
    return JSON.parse(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getNestedValue(record: unknown, keys: string[]): unknown {
  let current = record;
  for (const key of keys) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function stringValue(value: unknown): string {
  return normalizeWhitespace(typeof value === "string" ? value : "");
}

function parseDetailEventDataFromHtml(html: string, overview: G5OverviewEvent): Event {
  const $ = cheerio.load(html);
  const script = $("script#ep-event-single-script-js-extra").first().html() ?? "";
  const parsed = extractObjectFromScript(script);

  const eventRecord = getNestedValue(parsed, ["em_event_data", "event", "event"]);
  const title = stringValue(getNestedValue(eventRecord, ["name"])) || overview.title;
  const description = normalizeDescription(
    stringValue(getNestedValue(eventRecord, ["description"])) || overview.description,
  );
  const eventUrl = stringValue(getNestedValue(eventRecord, ["event_url"])) || overview.url;
  const location = normalizeG5Location(
    stringValue(getNestedValue(eventRecord, ["venue_details", "name"])) || overview.location,
  );

  const unixDateTime = dateTimeFromUnixSeconds(getNestedValue(eventRecord, ["em_start_date_time"]));
  const fallbackDateFromString =
    parseG5DateToIso(stringValue(getNestedValue(eventRecord, ["fstart_date"]))) || overview.date;
  const date = unixDateTime.date ?? fallbackDateFromString;

  const scriptTime = parseG5Time(stringValue(getNestedValue(eventRecord, ["em_start_time"])));
  const time = unixDateTime.time !== "TBA" ? unixDateTime.time : scriptTime !== "TBA" ? scriptTime : overview.time;

  const imageRaw = stringValue(getNestedValue(eventRecord, ["image_url"]));
  const image = imageRaw && !imageRaw.includes("dummy_image.png")
    ? toAbsoluteUrl(imageRaw, eventUrl)
    : overview.image ?? "";

  return {
    location: location || CANONICAL_G5_LOCATION,
    title,
    description,
    date,
    time,
    event_url: eventUrl,
    ...(image ? { image } : {}),
  };
}

function buildPageCandidates(baseUrl: string, maxPages: number): string[] {
  if (maxPages <= 1) {
    return [];
  }

  const baseNoSlash = baseUrl.replace(/\/+$/, "");
  const urls = new Set<string>();

  for (let page = 2; page <= maxPages; page += 1) {
    urls.add(`${baseNoSlash}/page/${page}/`);
    urls.add(`${baseUrl}?paged=${page}`);
    urls.add(`${baseUrl}?ep_page=${page}`);
    urls.add(`${baseUrl}?ep_events_paged=${page}`);
  }

  return Array.from(urls);
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
        throw new Error(`G5 fetch failed (${response.status}) for ${url}`);
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

export async function scrapeG5Events(fetchImpl: FetchLike = fetch): Promise<Event[]> {
  const baseHtml = await fetchPage(fetchImpl, G5_ALL_EVENTS_URL);
  if (!baseHtml) {
    throw new Error("G5 list page is unavailable");
  }

  const maxPages = extractMaxPagesFromHtml(baseHtml);
  const aggregatedOverview = extractOverviewEventsFromHtml(baseHtml, G5_ALL_EVENTS_URL);

  const pageCandidates = buildPageCandidates(G5_ALL_EVENTS_URL, maxPages);
  for (const pageUrl of pageCandidates) {
    const pageHtml = await fetchPage(fetchImpl, pageUrl);
    if (!pageHtml) {
      continue;
    }

    const pageEvents = extractOverviewEventsFromHtml(pageHtml, pageUrl);
    if (pageEvents.length > 0) {
      aggregatedOverview.push(...pageEvents);
    }
  }

  const overviewEvents = uniqueByUrl(aggregatedOverview);
  if (overviewEvents.length === 0) {
    throw new Error("G5 parser did not extract any overview events");
  }

  const events: Event[] = [];
  for (const overview of overviewEvents) {
    try {
      const detailHtml = await fetchPage(fetchImpl, overview.url);
      if (!detailHtml) {
        events.push({
          location: overview.location,
          title: overview.title,
          description: overview.description,
          date: overview.date,
          time: overview.time,
          event_url: overview.url,
          ...(overview.image ? { image: overview.image } : {}),
        });
        continue;
      }

      events.push(parseDetailEventDataFromHtml(detailHtml, overview));
    } catch {
      events.push({
        location: overview.location,
        title: overview.title,
        description: overview.description,
        date: overview.date,
        time: overview.time,
        event_url: overview.url,
        ...(overview.image ? { image: overview.image } : {}),
      });
    }
  }

  return events;
}

export const __g5Internals = {
  parseG5DateToIso,
  parseG5Time,
  normalizeG5Location,
  extractOverviewEventsFromHtml,
  extractMaxPagesFromHtml,
  parseDetailEventDataFromHtml,
  buildPageCandidates,
};
