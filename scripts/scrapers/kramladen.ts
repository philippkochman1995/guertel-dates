import * as cheerio from "cheerio";
import { normalizeDescription, normalizeWhitespace } from "../lib/normalize";
import type { Event } from "../types";

export const KRAMLADEN_URL = "https://www.kramladenvienna.at/";
const KRAMLADEN_WIDGET_EMBED_IDS = ["25537003"];
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

type FetchLike = typeof fetch;

type KramladenOverviewEvent = Event & {
  id: string;
};

const CP1252_EXTENDED_MAP: Record<number, string> = {
  0x80: "\u20ac",
  0x82: "\u201a",
  0x83: "\u0192",
  0x84: "\u201e",
  0x85: "\u2026",
  0x86: "\u2020",
  0x87: "\u2021",
  0x88: "\u02c6",
  0x89: "\u2030",
  0x8a: "\u0160",
  0x8b: "\u2039",
  0x8c: "\u0152",
  0x8e: "\u017d",
  0x91: "\u2018",
  0x92: "\u2019",
  0x93: "\u201c",
  0x94: "\u201d",
  0x95: "\u2022",
  0x96: "\u2013",
  0x97: "\u2014",
  0x98: "\u02dc",
  0x99: "\u2122",
  0x9a: "\u0161",
  0x9b: "\u203a",
  0x9c: "\u0153",
  0x9e: "\u017e",
  0x9f: "\u0178",
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
  const match = normalizeWhitespace(value).match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return "TBA";
  }

  return `${match[1].padStart(2, "0")}:${match[2]}`;
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

function decodeJavaScriptEscapes(value: string): string {
  return value
    .replace(/\\x([0-9a-f]{2})/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/\\\//g, "/")
    .replace(/\\"/g, "\"")
    .replace(/\\'/g, "'")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
}

function decodeRtfEscapes(value: string): string {
  return value.replace(/\\'([0-9a-f]{2})/gi, (_, hex) => {
    const code = Number.parseInt(hex, 16);
    if (!Number.isFinite(code)) {
      return "";
    }

    const mapped = CP1252_EXTENDED_MAP[code];
    if (mapped) {
      return mapped;
    }

    return String.fromCodePoint(code);
  });
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

function cleanupDescription(value: string): string {
  const paragraphs = normalizeDescription(value)
    .split(/\n{2,}/)
    .map((paragraph) => normalizeDescription(paragraph))
    .filter(Boolean);

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const paragraph of paragraphs) {
    const key = paragraph.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(paragraph);
  }

  return deduped.join("\n\n");
}

function parseDateTime(value: string): { date?: string; time: string } {
  const normalized = normalizeWhitespace(value);
  const isoMatch = normalized.match(/(\d{4}-\d{2}-\d{2})(?:[T\s]([01]?\d|2[0-3]):([0-5]\d))?/);
  if (isoMatch) {
    return {
      date: isoMatch[1],
      time: isoMatch[2] && isoMatch[3] ? `${isoMatch[2].padStart(2, "0")}:${isoMatch[3]}` : "TBA",
    };
  }

  const englishMatch = normalized.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i,
  );
  if (!englishMatch) {
    return { time: "TBA" };
  }

  const monthByName: Record<string, string> = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
  };
  const month = monthByName[englishMatch[1].toLowerCase()] ?? "";
  const day = String(Number(englishMatch[2])).padStart(2, "0");
  const year = englishMatch[3];
  const hour12 = Number(englishMatch[4]);
  const minute = englishMatch[5];
  const meridiem = englishMatch[6].toUpperCase();
  const hour24 = meridiem === "PM" && hour12 < 12 ? hour12 + 12 : meridiem === "AM" && hour12 === 12 ? 0 : hour12;

  if (!month) {
    return { time: "TBA" };
  }

  return {
    date: `${year}-${month}-${day}`,
    time: `${String(hour24).padStart(2, "0")}:${minute}`,
  };
}

function eventUrlFromId(id: string): string {
  if (!id) {
    return KRAMLADEN_URL;
  }
  return `https://facebook.com/events/${id}`;
}

function extractEventId(rawId: string): string {
  return normalizeWhitespace(rawId).split("-")[0]?.replace(/[^\d]/g, "") ?? "";
}

function extractOverviewEventsFromHtml(html: string, sourceUrl: string): KramladenOverviewEvent[] {
  const $ = cheerio.load(html);
  const events: KramladenOverviewEvent[] = [];

  $(".sk-event-item").each((_, node) => {
    const item = $(node);
    const id = extractEventId(item.attr("data-id") ?? "");
    const title = normalizeWhitespace(item.find(".sk-event-item-title").first().text());
    const dateTimeRaw = normalizeWhitespace(
      item.find("time.icon_text").first().attr("datetime")
        ?? item.find("time.icon_text").first().text(),
    );
    const parsedDateTime = parseDateTime(dateTimeRaw);
    const venue = normalizeWhitespace(item.find(".--sk-venue").first().text());
    const address = normalizeWhitespace(item.find(".--sk-location").first().text());
    const location = venue || address || "Kramladen";
    const viewOnFacebookHref = normalizeWhitespace(
      item.find(".sk-popup-viewonfb, .sk-event-item-viewonfb").first().attr("href") ?? "",
    );
    const eventUrl = viewOnFacebookHref
      ? toAbsoluteUrl(viewOnFacebookHref, sourceUrl)
      : eventUrlFromId(id);
    const imageRaw = normalizeWhitespace(
      item.find(".sk-event-item-thumbnail img").first().attr("src")
        ?? item.find(".sk-event-item-thumbnail img").first().attr("data-src")
        ?? "",
    );
    const descriptionHtml =
      item.find(".sk-event-item-desc").first().html()
      ?? item.find(".sk-event-item-desc--less").first().html()
      ?? "";
    const description = cleanupDescription(
      decodeRtfEscapes(
        decodeHtmlEntities(
          structuredTextFromHtml(descriptionHtml),
        ),
      ),
    );

    if (!title || !parsedDateTime.date || !eventUrl) {
      return;
    }

    events.push({
      id,
      location,
      title,
      description,
      date: parsedDateTime.date,
      time: normalizeTime(parsedDateTime.time),
      event_url: eventUrl,
      ...(imageRaw ? { image: toAbsoluteUrl(imageRaw, sourceUrl) } : {}),
    });
  });

  return dedupeEvents(events);
}

function dedupeEvents(events: KramladenOverviewEvent[]): KramladenOverviewEvent[] {
  const byKey = new Map<string, KramladenOverviewEvent>();

  for (const event of events) {
    const key = `${event.id || event.event_url}|${event.date}|${event.time}|${event.title}`;
    if (!byKey.has(key)) {
      byKey.set(key, event);
    }
  }

  return Array.from(byKey.values());
}

function extractSociableKitUrls(html: string, sourceUrl: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();

  $("iframe[src], script[src]").each((_, node) => {
    const element = $(node);
    const src = normalizeWhitespace(element.attr("src") ?? "");
    if (!src || !/sociablekit\.com/i.test(src)) {
      return;
    }
    urls.add(toAbsoluteUrl(src, sourceUrl));
  });

  const explicitUrls = html.match(/https?:\/\/[^"' ]*sociablekit\.com[^"' ]*/gi) ?? [];
  for (const url of explicitUrls) {
    urls.add(toAbsoluteUrl(url, sourceUrl));
  }

  const embedIds = new Set<string>(KRAMLADEN_WIDGET_EMBED_IDS);

  $(".sk-fb-event[data-embed-id], [data-embed-id]").each((_, node) => {
    const element = $(node);
    const id = normalizeWhitespace(element.attr("data-embed-id") ?? "");
    if (/^\d+$/.test(id)) {
      embedIds.add(id);
    }
  });

  const fromRegex = html.match(/data-embed-id=["'](\d+)["']/gi) ?? [];
  for (const match of fromRegex) {
    const id = match.match(/(\d+)/)?.[1] ?? "";
    if (id) {
      embedIds.add(id);
    }
  }

  for (const id of embedIds) {
    urls.add(`https://widgets.sociablekit.com/facebook-page-events/iframe/${id}`);
    urls.add(`https://widgets.sociablekit.com/facebook-page-events/${id}`);
    urls.add(`https://widgets.sociablekit.com/facebook-page-events/new/${id}`);
    urls.add(`https://widgets.sociablekit.com/facebook-page-events/new/?embed_id=${id}`);
    urls.add(`https://widgets.sociablekit.com/facebook-page-events/new/iframe/${id}`);
    urls.add(`https://widgets.sociablekit.com/facebook-page-events/new/widget.js?embed_id=${id}`);
  }

  urls.add("https://widgets.sociablekit.com/facebook-page-events/new/widget.js");

  return Array.from(urls);
}

function extractSociableKitSourceHandles(raw: string): string[] {
  const handles = new Set<string>();
  const matches = raw.matchAll(/sources\/facebook-page-events\/([a-z0-9._-]+)/gi);
  for (const match of matches) {
    const handle = normalizeWhitespace(match[1] ?? "");
    if (handle) {
      handles.add(handle);
    }
  }
  return Array.from(handles);
}

function buildApiCandidatesFromHandle(handle: string): string[] {
  return [
    `https://api.sociablekit.com/sources/facebook-page-events/${handle}`,
    `https://api.sociablekit.com/sources/facebook-page-events/${handle}.json`,
    `https://api.sociablekit.com/facebook-page-events/${handle}`,
    `https://api.sociablekit.com/facebook-page-events/${handle}.json`,
    `https://widgets.sociablekit.com/sources/facebook-page-events/${handle}`,
    `https://widgets.sociablekit.com/sources/facebook-page-events/${handle}.json`,
    `https://data-image.sociablekit.com/sources/facebook-page-events/${handle}`,
    `https://data-image.sociablekit.com/sources/facebook-page-events/${handle}.json`,
    `https://data-image.sociablekit.com/sources/facebook-page-events/${handle}/events.json`,
  ];
}

function extractSociableKitApiUrls(html: string, sourceUrl: string): string[] {
  const urls = new Set<string>();
  const candidates = getHtmlCandidates(html);

  for (const candidate of candidates) {
    const explicitUrls = candidate.match(/https?:\/\/[^"' ]*(?:sociablekit\.com|data-image\.sociablekit\.com)[^"' ]*/gi) ?? [];
    for (const url of explicitUrls) {
      const absoluteUrl = toAbsoluteUrl(url, sourceUrl);
      if (/facebook-page-events|sources\/facebook-page-events|\/api\/|\.json(?:$|[?#])/i.test(absoluteUrl)) {
        urls.add(absoluteUrl);
      }
    }

    for (const handle of extractSociableKitSourceHandles(candidate)) {
      for (const apiCandidate of buildApiCandidatesFromHandle(handle)) {
        urls.add(apiCandidate);
      }
    }
  }

  return Array.from(urls);
}

function getHtmlCandidates(rawHtml: string): string[] {
  const candidates = new Set<string>([rawHtml]);
  const rawHasItems = /<div[^>]+class=["'][^"']*sk-event-item/.test(rawHtml);
  const decodedHtml = decodeHtmlEntities(rawHtml);
  const decodedHasItems = /<div[^>]+class=["'][^"']*sk-event-item/.test(decodedHtml);
  if (decodedHtml !== rawHtml) {
    candidates.add(decodedHtml);
  }

  const jsDecoded = decodeJavaScriptEscapes(decodedHtml);
  if (jsDecoded !== decodedHtml) {
    candidates.add(jsDecoded);
  }

  const $ = cheerio.load(rawHtml);
  const text = decodeHtmlEntities($("body").text());
  if (!rawHasItems && !decodedHasItems && /<div[^>]+class=["'][^"']*sk-event-item/.test(text)) {
    candidates.add(text);
  }

  const jsDecodedText = decodeJavaScriptEscapes(text);
  if (!rawHasItems && !decodedHasItems && /<div[^>]+class=["'][^"']*sk-event-item/.test(jsDecodedText)) {
    candidates.add(jsDecodedText);
  }

  return Array.from(candidates);
}

function looksLikeRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringValue(value: unknown): string {
  return normalizeWhitespace(typeof value === "string" ? value : "");
}

function pickStringFromKeys(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = toStringValue(record[key]);
    if (value) {
      return value;
    }
  }
  return "";
}

function pickNestedValue(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = record[key];
  if (!looksLikeRecord(value)) {
    return null;
  }
  return value;
}

function parseDateTimeFromRecord(record: Record<string, unknown>): { date?: string; time: string } {
  const directDateTime = pickStringFromKeys(record, [
    "datetime",
    "date_time",
    "start_time",
    "startDate",
    "start_date",
    "date",
    "event_date",
  ]);
  if (directDateTime) {
    return parseDateTime(directDateTime);
  }

  const dateRaw = pickStringFromKeys(record, ["date", "event_date", "start_date"]);
  const timeRaw = pickStringFromKeys(record, ["time", "event_time", "start_time"]);
  if (dateRaw && timeRaw) {
    return parseDateTime(`${dateRaw} ${timeRaw}`);
  }

  return { time: "TBA" };
}

function normalizeLocation(record: Record<string, unknown>): string {
  const directLocation = pickStringFromKeys(record, ["venue", "location", "address"]);
  if (directLocation) {
    return directLocation;
  }

  const place = pickNestedValue(record, "place");
  if (place) {
    return pickStringFromKeys(place, ["name", "title", "address"]) || "Kramladen";
  }

  return "Kramladen";
}

function normalizeEventUrl(record: Record<string, unknown>, id: string): string {
  const fromRecord = pickStringFromKeys(record, ["event_url", "eventUrl", "url", "link", "permalink"]);
  if (fromRecord) {
    return toAbsoluteUrl(fromRecord, KRAMLADEN_URL);
  }
  return eventUrlFromId(id);
}

function normalizeImageUrl(record: Record<string, unknown>): string {
  const directImage = pickStringFromKeys(record, ["image", "image_url", "thumbnail", "picture"]);
  if (directImage) {
    return toAbsoluteUrl(directImage, KRAMLADEN_URL);
  }

  const image = pickNestedValue(record, "image");
  if (image) {
    return toAbsoluteUrl(pickStringFromKeys(image, ["url", "src"]), KRAMLADEN_URL);
  }

  return "";
}

function extractEventFromRecord(record: Record<string, unknown>): KramladenOverviewEvent | null {
  const id = extractEventId(
    pickStringFromKeys(record, ["id", "event_id", "facebook_event_id", "eventId"]),
  );
  const title = pickStringFromKeys(record, ["title", "name", "event_name"]);
  const parsedDateTime = parseDateTimeFromRecord(record);
  const eventUrl = normalizeEventUrl(record, id);

  if (!title || !parsedDateTime.date || !eventUrl) {
    return null;
  }

  const description = cleanupDescription(pickStringFromKeys(record, ["description", "desc", "details", "about"]));
  const image = normalizeImageUrl(record);

  return {
    id,
    title,
    description,
    date: parsedDateTime.date,
    time: normalizeTime(parsedDateTime.time),
    location: normalizeLocation(record),
    event_url: eventUrl,
    ...(image ? { image } : {}),
  };
}

function extractEventsFromJsonPayload(payload: unknown): KramladenOverviewEvent[] {
  const events: KramladenOverviewEvent[] = [];
  const queue: unknown[] = [payload];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item);
      }
      continue;
    }

    if (!looksLikeRecord(current)) {
      continue;
    }

    const event = extractEventFromRecord(current);
    if (event) {
      events.push(event);
    }

    for (const value of Object.values(current)) {
      if (Array.isArray(value) || looksLikeRecord(value)) {
        queue.push(value);
      }
    }
  }

  return dedupeEvents(events);
}

function parseJsonCandidates(raw: string): unknown[] {
  const payloads: unknown[] = [];
  const trimmed = raw.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      payloads.push(JSON.parse(trimmed));
    } catch {
      // Ignore parse errors for non-JSON responses.
    }
  }

  const $ = cheerio.load(raw);
  $("script[type='application/json']").each((_, node) => {
    const text = $(node).text().trim();
    if (!text) {
      return;
    }

    try {
      payloads.push(JSON.parse(text));
    } catch {
      // Ignore malformed JSON script blocks.
    }
  });

  return payloads;
}

function isSociableKitEventUrl(url: string): boolean {
  return /sociablekit\.com|facebook-page-events|data-image\.sociablekit\.com/i.test(url);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error ?? "");
}

function isMissingPlaywrightBrowserError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return /Executable doesn't exist/i.test(message) && /playwright install/i.test(message);
}

async function scrapeKramladenWithPlaywright(): Promise<{
  htmlSnapshots: string[];
  payloads: unknown[];
}> {
  let chromium: any;
  try {
    const playwright = await import("playwright");
    chromium = playwright.chromium;
  } catch {
    console.warn(
      "Playwright fallback unavailable (dependency missing). Install with: npm i -D playwright",
    );
    return { htmlSnapshots: [], payloads: [] };
  }

  const htmlSnapshots: string[] = [];
  const payloads: unknown[] = [];
  const responseBodies = new Set<string>();
  let browser: any;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: BROWSER_USER_AGENT,
      locale: "de-AT",
    });
    const page = await context.newPage();

    page.on("response", async (response: any) => {
      const url = response.url();
      if (!isSociableKitEventUrl(url) || response.status() >= 400) {
        return;
      }

      const contentType = String(response.headers()?.["content-type"] ?? "").toLowerCase();
      const looksJson =
        contentType.includes("application/json")
        || /\.json(?:$|[?#])/i.test(url)
        || /api\.sociablekit\.com|sources\/facebook-page-events/i.test(url);
      if (!looksJson) {
        return;
      }

      try {
        const body = await response.text();
        if (!body || responseBodies.has(body)) {
          return;
        }
        responseBodies.add(body);
      } catch {
        // Ignore response parsing errors from intercepted network events.
      }
    });

    await page.goto(KRAMLADEN_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(3_000);

    for (let i = 0; i < 3; i += 1) {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(1_200);
    }

    try {
      await page.waitForSelector(".sk-event-item", { timeout: 12_000 });
    } catch {
      // Continue with whatever got rendered so far.
    }

    htmlSnapshots.push(await page.content());
    const itemsHtml = await page.$$eval(".sk-event-item", (nodes) => nodes.map((node) => node.outerHTML).join("\n"));
    if (itemsHtml) {
      htmlSnapshots.push(itemsHtml);
    }

    await context.close();
  } catch (error) {
    if (isMissingPlaywrightBrowserError(error)) {
      console.warn("Playwright fallback unavailable for Kramladen (browser binary missing). Install with: npx playwright install");
    } else {
      const firstErrorLine = getErrorMessage(error).split("\n")[0]?.trim();
      console.warn(`Playwright fallback failed for Kramladen: ${firstErrorLine || "unknown error"}`);
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  for (const body of responseBodies) {
    for (const payload of parseJsonCandidates(body)) {
      payloads.push(payload);
    }
  }

  return { htmlSnapshots, payloads };
}

async function fetchPage(fetchImpl: FetchLike, url: string): Promise<string | null> {
  const attempts = 3;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          "user-agent": BROWSER_USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,*/*;q=0.8",
          "accept-language": "de-AT,de;q=0.9,en-US;q=0.8,en;q=0.7",
          referer: KRAMLADEN_URL,
          origin: KRAMLADEN_URL.replace(/\/$/, ""),
        },
      });

      if (response.status === 404) {
        return null;
      }
      if (response.status === 403 && /sociablekit\.com/i.test(url)) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Kramladen fetch failed (${response.status}) for ${url}`);
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

export async function scrapeKramladenEvents(fetchImpl: FetchLike = fetch): Promise<Event[]> {
  const homepageHtml = await fetchPage(fetchImpl, KRAMLADEN_URL);
  if (!homepageHtml) {
    throw new Error("Kramladen parser failed to fetch homepage");
  }

  const allRawHtml = [homepageHtml];
  const rawJsonPayloads: unknown[] = [];
  const sociableKitUrls = new Set<string>();
  const apiUrls = new Set<string>();

  for (const candidate of getHtmlCandidates(homepageHtml)) {
    for (const url of extractSociableKitUrls(candidate, KRAMLADEN_URL)) {
      sociableKitUrls.add(url);
    }
    for (const url of extractSociableKitApiUrls(candidate, KRAMLADEN_URL)) {
      apiUrls.add(url);
    }
  }

  for (const url of sociableKitUrls) {
    try {
      const html = await fetchPage(fetchImpl, url);
      if (html) {
        allRawHtml.push(html);
        for (const payload of parseJsonCandidates(html)) {
          rawJsonPayloads.push(payload);
        }
        for (const apiUrl of extractSociableKitApiUrls(html, url)) {
          apiUrls.add(apiUrl);
        }
      }
    } catch (error) {
      console.warn(`Skipping Kramladen widget due to fetch/parse error: ${url}`, error);
    }
  }

  for (const url of apiUrls) {
    try {
      const raw = await fetchPage(fetchImpl, url);
      if (!raw) {
        continue;
      }
      for (const payload of parseJsonCandidates(raw)) {
        rawJsonPayloads.push(payload);
      }
    } catch (error) {
      console.warn(`Skipping Kramladen API candidate due to fetch/parse error: ${url}`, error);
    }
  }

  const events: KramladenOverviewEvent[] = [];
  for (const rawHtml of allRawHtml) {
    for (const candidate of getHtmlCandidates(rawHtml)) {
      events.push(...extractOverviewEventsFromHtml(candidate, KRAMLADEN_URL));
    }
  }
  for (const payload of rawJsonPayloads) {
    events.push(...extractEventsFromJsonPayload(payload));
  }

  const deduped = dedupeEvents(events);
  if (deduped.length > 0) {
    return deduped.map(({ id: _id, ...event }) => event);
  }

  const dynamicFallback = await scrapeKramladenWithPlaywright();
  for (const html of dynamicFallback.htmlSnapshots) {
    for (const candidate of getHtmlCandidates(html)) {
      events.push(...extractOverviewEventsFromHtml(candidate, KRAMLADEN_URL));
    }
  }
  for (const payload of dynamicFallback.payloads) {
    events.push(...extractEventsFromJsonPayload(payload));
  }

  const fallbackDeduped = dedupeEvents(events);
  if (fallbackDeduped.length === 0) {
    console.warn("Kramladen parser did not extract any events; continuing with empty result.");
    return [];
  }

  return fallbackDeduped.map(({ id: _id, ...event }) => event);
}

export const __kramladenInternals = {
  parseDateTime,
  decodeHtmlEntities,
  decodeRtfEscapes,
  extractOverviewEventsFromHtml,
  extractSociableKitUrls,
  extractSociableKitApiUrls,
  extractEventsFromJsonPayload,
  getHtmlCandidates,
  getErrorMessage,
  isMissingPlaywrightBrowserError,
};
