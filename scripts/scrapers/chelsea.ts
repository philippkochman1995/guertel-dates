import * as cheerio from "cheerio";
import { parseEuropeanDateToIso } from "../lib/date";
import { normalizeDescription, normalizeWhitespace } from "../lib/normalize";
import type { Event } from "../types";

export const CHELSEA_CONCERTS_URL = "https://www.chelsea.co.at/concerts.php";

const DATE_PATTERN = /(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?/;
const TIME_PATTERN = /(?:^|\s)([01]?\d|2[0-3])[:.]([0-5]\d)(?:\s*UHR)?(?:\s|$)/i;
const WEEKDAY_PREFIX = /^(MO|DI|MI|DO|FR|SA|SO|MON|TUE|WED|THU|FRI|SAT|SUN)[,.]?\s+/i;

function toAbsoluteUrl(value: string, baseUrl: string): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function normalizeTimeFromText(value: string): string {
  const timeMatch = value.match(TIME_PATTERN);
  if (!timeMatch) {
    return "TBA";
  }

  const hours = timeMatch[1].padStart(2, "0");
  const minutes = timeMatch[2];
  return `${hours}:${minutes}`;
}

function inferTitleFromText(text: string): string {
  const dateMatch = text.match(DATE_PATTERN);
  if (!dateMatch || dateMatch.index === undefined) {
    return "";
  }

  let remainder = text.slice(dateMatch.index + dateMatch[0].length).trim();
  remainder = remainder.replace(/^[-,:;|/\\\s]+/, "");
  remainder = remainder.replace(WEEKDAY_PREFIX, "");

  const stopPatterns = [
    /\bDOORS?\b/i,
    /\bSTART\b/i,
    /\bBAND ON STAGE\b/i,
    /\bTICKETS?\b/i,
    /\bVVK\b/i,
    /\bEINLASS\b/i,
  ];

  let stopIndex = remainder.length;
  for (const pattern of stopPatterns) {
    const match = pattern.exec(remainder);
    if (match?.index !== undefined) {
      stopIndex = Math.min(stopIndex, match.index);
    }
  }

  const trimmed = normalizeWhitespace(remainder.slice(0, stopIndex));
  const hardSplit = trimmed.split(/ {2,}| \| |\. /)[0] ?? "";
  return normalizeWhitespace(hardSplit);
}

function sanitizeCandidateTitle(value: string): string {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }

  const blocked = new Set([
    "DETAILS",
    "MEHR",
    "MORE",
    "INFO",
    "TICKETS",
    "TICKET",
    "VVK",
    "LINK",
  ]);

  return blocked.has(normalized.toUpperCase()) ? "" : normalized;
}

function structuredTextFromHtml(html: string): string {
  const prepared = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<\/div\s*>/gi, "\n\n")
    .replace(/<\/h[1-6]\s*>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/li\s*>/gi, "\n");

  const text = cheerio.load(`<div>${prepared}</div>`)("div").text();
  return normalizeDescription(text);
}

function extractDescriptionWithStructure(
  element: cheerio.Cheerio<cheerio.Element>,
): string {
  const textNode = element.find(".text").first();
  if (textNode.length > 0) {
    const html = textNode.html();
    if (html) {
      return structuredTextFromHtml(html);
    }
    return normalizeDescription(textNode.text());
  }

  const paragraphs = element
    .find("p")
    .toArray()
    .map((paragraph) => normalizeDescription(cheerio.load(paragraph).text()))
    .filter(Boolean);

  return paragraphs.join("\n\n");
}

function cleanupDescription(rawDescription: string, title: string): string {
  const normalized = normalizeDescription(rawDescription);
  if (!normalized) {
    return "";
  }

  const cleanedParagraphs: string[] = [];
  const seenParagraphs = new Set<string>();

  for (const paragraph of normalized.split(/\n{2,}/)) {
    const lines = paragraph
      .split("\n")
      .map((line) => normalizeWhitespace(line))
      .filter(Boolean)
      .filter((line) => !/^tickets?:$/i.test(line))
      .filter((line) => !(line.toLowerCase() === title.toLowerCase()))
      .filter((line) => {
        const isUrl = /^https?:\/\/\S+$/i.test(line);
        if (!isUrl) {
          return true;
        }

        // Keep editorial links like socials, drop repetitive ticket-shop links.
        return !/oeticket\.com/i.test(line);
      });

    const nextParagraph = normalizeDescription(lines.join("\n"));
    if (!nextParagraph) {
      continue;
    }

    const key = nextParagraph.toLowerCase();
    if (seenParagraphs.has(key)) {
      continue;
    }

    seenParagraphs.add(key);
    cleanedParagraphs.push(nextParagraph);
  }

  return cleanedParagraphs.join("\n\n");
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

function normalizeImageCandidate(value: string, sourceUrl: string): string {
  const absolute = toAbsoluteUrl(normalizeWhitespace(value), sourceUrl);
  return absolute ?? "";
}

function extractImageFromJsonLd(object: Record<string, unknown>, sourceUrl: string): string {
  const imageValue = object.image;
  if (typeof imageValue === "string") {
    return normalizeImageCandidate(imageValue, sourceUrl);
  }

  if (Array.isArray(imageValue)) {
    for (const candidate of imageValue) {
      if (typeof candidate === "string") {
        const normalized = normalizeImageCandidate(candidate, sourceUrl);
        if (normalized) {
          return normalized;
        }
      }
    }
  }

  return "";
}

function extractPrimaryImageFromElement(
  element: cheerio.Cheerio<cheerio.Element>,
  sourceUrl: string,
): string {
  const containers = [
    element,
    element.closest("table.termindetails"),
  ];

  const candidates: string[] = [];
  for (const container of containers) {
    if (!container || container.length === 0) {
      continue;
    }

    container.find("img").each((index) => {
      const imgElement = container.find("img").eq(index);
      const src = normalizeWhitespace(
        imgElement.attr("src") ?? imgElement.attr("data-src") ?? "",
      );
      if (!src) {
        return;
      }
      candidates.push(src);
    });
  }

  const filtered = candidates
    .filter((src) => !/btn_top|btn_|icon|logo/i.test(src))
    .map((src) => normalizeImageCandidate(src, sourceUrl))
    .filter(Boolean);

  const firstConcertImage = filtered.find((src) => /\/img\/concert_|concert_\d+_/i.test(src));
  return firstConcertImage ?? filtered[0] ?? "";
}

function parseEventFromJsonLd(
  object: Record<string, unknown>,
  sourceUrl: string,
): Event | null {
  const type = String(object["@type"] ?? "").toLowerCase();
  if (!type.includes("event")) {
    return null;
  }

  const name = normalizeWhitespace(String(object.name ?? ""));
  const startDate = normalizeWhitespace(String(object.startDate ?? ""));
  if (!name || !startDate) {
    return null;
  }

  const parsedStart = new Date(startDate);
  if (Number.isNaN(parsedStart.getTime())) {
    return null;
  }

  const year = parsedStart.getUTCFullYear();
  const month = String(parsedStart.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsedStart.getUTCDate()).padStart(2, "0");
  const date = `${year}-${month}-${day}`;

  const time = Number.isNaN(parsedStart.getUTCHours())
    ? "TBA"
    : `${String(parsedStart.getUTCHours()).padStart(2, "0")}:${String(parsedStart.getUTCMinutes()).padStart(2, "0")}`;

  const description = normalizeDescription(String(object.description ?? ""));
  const url = toAbsoluteUrl(String(object.url ?? sourceUrl), sourceUrl) ?? sourceUrl;
  const image = extractImageFromJsonLd(object, sourceUrl);

  return {
    location: "Chelsea Wien",
    title: name,
    description,
    date,
    time,
    event_url: url,
    ...(image ? { image } : {}),
  };
}

function parseEventFromElement(
  element: cheerio.Cheerio<cheerio.Element>,
  sourceUrl: string,
): Event | null {
  const dateText = normalizeWhitespace(element.find(".date").first().text());
  const bandText = sanitizeCandidateTitle(element.find(".band").first().text());
  const descriptionText = normalizeWhitespace(element.find(".text").first().text());
  const textContent = normalizeWhitespace(
    [dateText, bandText, descriptionText, normalizeWhitespace(element.text())].filter(Boolean).join(" "),
  );

  if (!DATE_PATTERN.test(textContent) && !DATE_PATTERN.test(dateText)) {
    return null;
  }

  const date = parseEuropeanDateToIso(dateText || textContent);
  if (!date) {
    return null;
  }

  const heading = sanitizeCandidateTitle(element.find("h1, h2, h3, h4, strong, b, .title").first().text());
  const anchorTitle = sanitizeCandidateTitle(element.find("a").first().text());
  const inferredTitle = sanitizeCandidateTitle(inferTitleFromText(textContent));
  const title = bandText || heading || anchorTitle || inferredTitle;

  if (!title) {
    return null;
  }

  const extractedDescription = extractDescriptionWithStructure(element);
  const description = cleanupDescription(extractedDescription || descriptionText || "", title);
  const absoluteUrl = CHELSEA_CONCERTS_URL;
  const image = extractPrimaryImageFromElement(element, sourceUrl);

  return {
    location: "Chelsea Wien",
    title,
    description,
    date,
    time: normalizeTimeFromText(textContent),
    event_url: absoluteUrl,
    ...(image ? { image } : {}),
  };
}

export function parseChelseaEventsFromHtml(html: string, sourceUrl = CHELSEA_CONCERTS_URL): Event[] {
  const $ = cheerio.load(html);
  const collected: Event[] = [];

  $("script[type='application/ld+json']").each((_, node) => {
    const raw = normalizeWhitespace($(node).text());
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      for (const candidate of flattenJsonLd(parsed)) {
        const event = parseEventFromJsonLd(candidate, sourceUrl);
        if (event) {
          collected.push(event);
        }
      }
    } catch {
      // Ignore malformed JSON-LD and continue with HTML extraction.
    }
  });

  const seenText = new Set<string>();
  $(".concert-item, .event-item, .event, .concert, article, li, tr").each((_, node) => {
    const element = $(node);
    const text = normalizeWhitespace(element.text());
    if (!text || seenText.has(text)) {
      return;
    }

    seenText.add(text);
    const event = parseEventFromElement(element, sourceUrl);
    if (event) {
      collected.push(event);
    }
  });

  if (collected.length === 0) {
    const specificRows = $(".date, .band, .text")
      .map((_, node) => $(node).closest("article, li, tr, div"))
      .get()
      .filter((node): node is cheerio.Element => Boolean(node));

    for (const node of specificRows) {
      const event = parseEventFromElement($(node), sourceUrl);
      if (event) {
        collected.push(event);
      }
    }
  }

  if (collected.length === 0) {
    const seenText = new Set<string>();
    $("main *, .content *, #content *, body *").each((_, node) => {
      const element = $(node);
      const text = normalizeWhitespace(element.text());

      if (!text || text.length < 10 || text.length > 500 || seenText.has(text)) {
        return;
      }

      if (!DATE_PATTERN.test(text)) {
        return;
      }

      seenText.add(text);
      const event = parseEventFromElement(element, sourceUrl);
      if (event) {
        collected.push(event);
      }
    });
  }

  return collected;
}

export async function scrapeChelseaEvents(): Promise<Event[]> {
  const response = await fetch(CHELSEA_CONCERTS_URL, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; musik-am-guertel-bot/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(`Chelsea fetch failed with status ${response.status}`);
  }

  const html = await response.text();
  const events = parseChelseaEventsFromHtml(html);

  if (events.length === 0) {
    throw new Error("Chelsea parser did not extract any events");
  }

  return events;
}
