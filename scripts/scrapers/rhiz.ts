import * as cheerio from "cheerio";
import { normalizeDescription, normalizeWhitespace } from "../lib/normalize";
import type { Event } from "../types";

export const RHIZ_BASE_URL = "https://rhiz.wien/";
const RHIZ_PROMOTIONS_PATH = "/wp-json/copilot-promotion/v1/promotions";
const PAGE_SIZE = 50;
const RHIZ_TIME_ZONE = "Europe/Vienna";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

type FetchLike = typeof fetch;

type RhizPromotion = {
  slug?: unknown;
  title?: unknown;
  start?: unknown;
  venueName?: unknown;
  venueRoom?: unknown;
  venueCity?: unknown;
  rawEvent?: unknown;
};

type RhizPromotionResponse = {
  data?: unknown;
  count?: unknown;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function looksLikeRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toAbsoluteUrl(value: string, baseUrl: string): string {
  if (!normalizeWhitespace(value)) {
    return "";
  }
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

function normalizeTime(value: string): string {
  const match = normalizeWhitespace(value).match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return "TBA";
  }
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function parseDateTime(value: string): { date?: string; time: string } {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return { time: "TBA" };
  }

  const utcLike = normalized.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}:\d{2})(?:\.\d+)?$/);
  const parseCandidate = utcLike ? `${utcLike[1]}T${utcLike[2]}Z` : normalized;
  const parsed = new Date(parseCandidate);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDateInTimeZone(parsed, RHIZ_TIME_ZONE);
  }

  const fullMatch = normalized.match(/(\d{4}-\d{2}-\d{2})[T\s]([01]?\d|2[0-3]):([0-5]\d)/);
  if (fullMatch) {
    return {
      date: fullMatch[1],
      time: `${fullMatch[2].padStart(2, "0")}:${fullMatch[3]}`,
    };
  }

  const dateMatch = normalized.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    return { date: dateMatch[1], time: "TBA" };
  }

  return { time: "TBA" };
}

function formatDateInTimeZone(date: Date, timeZone: string): { date?: string; time: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
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

function toStringValue(value: unknown): string {
  return normalizeWhitespace(typeof value === "string" ? value : "");
}

function toBooleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  return null;
}

function toParsedRawEvent(value: unknown): Record<string, unknown> | null {
  if (looksLikeRecord(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return looksLikeRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getPathValue(record: Record<string, unknown>, ...keys: string[]): unknown {
  let current: unknown = record;
  for (const key of keys) {
    if (Array.isArray(current)) {
      const index = Number.parseInt(key, 10);
      if (!Number.isFinite(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (typeof current !== "object" || current === null) {
      return "";
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function getNestedRecord(record: Record<string, unknown>, ...keys: string[]): Record<string, unknown> | null {
  const value = getPathValue(record, ...keys);
  return looksLikeRecord(value) ? value : null;
}

function getNestedString(record: Record<string, unknown>, ...keys: string[]): string {
  return toStringValue(getPathValue(record, ...keys));
}

function getRawEventStart(rawEvent: Record<string, unknown>): string {
  return getNestedString(rawEvent, "start", "value", "dateTimeISO");
}

function getRawEventLocation(rawEvent: Record<string, unknown>): string {
  const roomName = getNestedString(rawEvent, "venues", "value", "items", "0", "room", "name");
  if (roomName) {
    return roomName;
  }

  const locationName = getNestedString(rawEvent, "venues", "value", "items", "0", "room", "location", "name");
  if (locationName) {
    return locationName;
  }

  return "rhiz";
}

function getRawEventImage(rawEvent: Record<string, unknown>): string {
  const image1920 = getNestedString(rawEvent, "image", "value", "file", "image1920", "href");
  if (image1920) {
    return image1920;
  }
  return getNestedString(rawEvent, "image", "value", "file", "publicUrl");
}

function getRawEventDescription(rawEvent: Record<string, unknown>): string {
  const parts: string[] = [];

  const subtitle = getNestedString(rawEvent, "subtitle", "value", "label");
  if (subtitle) {
    parts.push(subtitle);
  }

  const descriptionHtml = getNestedString(rawEvent, "description", "value", "html");
  if (descriptionHtml) {
    parts.push(structuredTextFromHtml(descriptionHtml));
  }

  const presaleInfoHtml = getNestedString(rawEvent, "presaleInfo", "value", "html");
  if (presaleInfoHtml) {
    parts.push(structuredTextFromHtml(presaleInfoHtml));
  }

  const boxOfficeInfoHtml = getNestedString(rawEvent, "boxOfficeInfo", "value", "html");
  if (boxOfficeInfoHtml) {
    parts.push(structuredTextFromHtml(boxOfficeInfoHtml));
  }

  const lines = getRawEventLineup(rawEvent);
  if (lines.length > 0) {
    parts.push(lines.join("\n"));
  }

  return normalizeDescription(parts.filter(Boolean).join("\n\n"));
}

function getRawEventLineup(rawEvent: Record<string, unknown>): string[] {
  const lineUp = getNestedRecord(rawEvent, "lineUp", "value");
  if (!lineUp) {
    return [];
  }

  const items = lineUp.items;
  if (!Array.isArray(items)) {
    return [];
  }

  const lineupEntries: string[] = [];
  for (const item of items) {
    if (!looksLikeRecord(item)) {
      continue;
    }
    const content = item.content;
    if (!looksLikeRecord(content)) {
      continue;
    }

    const artist = getNestedString(content, "artist", "value", "label");
    const program = getNestedString(content, "program", "value", "label");
    const origin = getNestedString(content, "origin", "value", "label");

    const title = normalizeWhitespace([artist, program, origin].filter(Boolean).join(" - "));
    if (!title) {
      continue;
    }
    lineupEntries.push(title);
  }

  return lineupEntries;
}

function getRawEventTicketUrl(rawEvent: Record<string, unknown>): string {
  return getNestedString(rawEvent, "presaleLink", "value", "href");
}

function getRawEventIsSoldOut(rawEvent: Record<string, unknown>): boolean {
  const soldOut = toBooleanValue(getNestedRecord(rawEvent, "soldOut", "value")?.bool);
  return soldOut === true;
}

function extractCountTotal(payload: RhizPromotionResponse): number | null {
  const count = payload.count;
  if (!count) {
    return null;
  }

  if (typeof count === "number" && Number.isFinite(count)) {
    return count;
  }

  if (looksLikeRecord(count)) {
    const total = count.total;
    if (typeof total === "number" && Number.isFinite(total)) {
      return total;
    }
    const parsed = Number.parseInt(String(total ?? ""), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function extractPromotions(payload: RhizPromotionResponse): RhizPromotion[] {
  if (!Array.isArray(payload.data)) {
    return [];
  }

  return payload.data.filter((entry): entry is RhizPromotion => looksLikeRecord(entry));
}

function toEventUrlFromSlug(slug: string): string {
  const url = new URL(RHIZ_BASE_URL);
  url.searchParams.set("copilot-slug", slug);
  return url.toString();
}

function parseEventFromPromotion(record: RhizPromotion): Event | null {
  const slug = toStringValue(record.slug);
  const title = toStringValue(record.title);
  const rawEvent = toParsedRawEvent(record.rawEvent);

  if (!slug || !title) {
    return null;
  }

  const startRaw = (rawEvent ? getRawEventStart(rawEvent) : "") || toStringValue(record.start);
  const parsedStart = parseDateTime(startRaw);
  if (!parsedStart.date) {
    return null;
  }

  const location = normalizeWhitespace(
    toStringValue(record.venueRoom)
      || toStringValue(record.venueName)
      || (rawEvent ? getRawEventLocation(rawEvent) : "")
      || "rhiz",
  );

  const description = rawEvent ? getRawEventDescription(rawEvent) : "";
  const imageRaw = rawEvent ? getRawEventImage(rawEvent) : "";
  const image = imageRaw ? toAbsoluteUrl(imageRaw, RHIZ_BASE_URL) : "";
  const ticketUrlRaw = rawEvent ? getRawEventTicketUrl(rawEvent) : "";
  const ticketUrl = ticketUrlRaw ? toAbsoluteUrl(ticketUrlRaw, RHIZ_BASE_URL) : "";
  const soldOut = rawEvent ? getRawEventIsSoldOut(rawEvent) : false;

  const descriptionParts = [description];
  if (soldOut) {
    descriptionParts.push("Sold out");
  }
  if (ticketUrl) {
    descriptionParts.push(`Tickets: ${ticketUrl}`);
  }

  return {
    location,
    title,
    description: normalizeDescription(descriptionParts.filter(Boolean).join("\n\n")),
    date: parsedStart.date,
    time: normalizeTime(parsedStart.time),
    event_url: toEventUrlFromSlug(slug),
    ...(image ? { image } : {}),
  };
}

function dedupeEvents(events: Event[]): Event[] {
  const byKey = new Map<string, Event>();
  for (const event of events) {
    const key = `${event.event_url}|${event.date}|${event.time}|${event.title.toLowerCase()}`;
    if (!byKey.has(key)) {
      byKey.set(key, event);
    }
  }
  return Array.from(byKey.values());
}

async function fetchRhizPromotionsPage(
  fetchImpl: FetchLike,
  paginationSkip: number,
  paginationTake: number,
): Promise<RhizPromotionResponse> {
  const attempts = 3;
  const url = new URL(RHIZ_PROMOTIONS_PATH, RHIZ_BASE_URL);
  url.searchParams.set("filter_archiv", "false");
  url.searchParams.set("filter_all", "false");
  url.searchParams.set("filter_slug", "");
  url.searchParams.set("filter_title", "");
  url.searchParams.set("filter_date", "");
  url.searchParams.set("filter_room", "");
  url.searchParams.set("filter_artist", "");
  url.searchParams.set("filter_venue", "");
  url.searchParams.set("filter_month", "");
  url.searchParams.set("pagination_take", String(paginationTake));
  url.searchParams.set("pagination_skip", String(paginationSkip));

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url.toString(), {
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/json,text/plain,*/*",
          "accept-language": "de-AT,de;q=0.9,en-US;q=0.8,en;q=0.7",
          referer: RHIZ_BASE_URL,
          origin: RHIZ_BASE_URL.replace(/\/$/, ""),
        },
      });

      if (!response.ok) {
        throw new Error(`RHIZ promotions fetch failed (${response.status})`);
      }

      const payload = await response.json() as unknown;
      if (!looksLikeRecord(payload)) {
        throw new Error("RHIZ promotions response is not an object");
      }

      return payload as RhizPromotionResponse;
    } catch (error) {
      if (attempt === attempts) {
        throw error;
      }
      await sleep(250 * attempt);
    }
  }

  return {};
}

export async function scrapeRhizEvents(fetchImpl: FetchLike = fetch): Promise<Event[]> {
  const allEvents: Event[] = [];
  let skip = 0;
  let totalCount: number | null = null;

  while (true) {
    const payload = await fetchRhizPromotionsPage(fetchImpl, skip, PAGE_SIZE);
    const promotions = extractPromotions(payload);
    totalCount = totalCount ?? extractCountTotal(payload);

    if (promotions.length === 0) {
      break;
    }

    for (const promotion of promotions) {
      const parsed = parseEventFromPromotion(promotion);
      if (parsed) {
        allEvents.push(parsed);
      }
    }

    skip += promotions.length;

    if (promotions.length < PAGE_SIZE) {
      break;
    }
    if (totalCount !== null && skip >= totalCount) {
      break;
    }
  }

  const deduped = dedupeEvents(allEvents);
  if (deduped.length === 0) {
    console.warn("RHIZ parser did not extract any events; continuing with empty result.");
  }
  return deduped;
}

export const __rhizInternals = {
  parseDateTime,
  structuredTextFromHtml,
  parseEventFromPromotion,
  extractPromotions,
  extractCountTotal,
};
