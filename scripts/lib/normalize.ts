import type { Event } from "../types";

const TBA_TIME = "TBA";

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeDescription(value: string): string {
  const lines = value.replace(/\r\n/g, "\n").split("\n").map((line) => normalizeWhitespace(line));
  const compacted: string[] = [];
  let previousEmpty = false;

  for (const line of lines) {
    const isEmpty = line.length === 0;
    if (isEmpty) {
      if (!previousEmpty) {
        compacted.push("");
      }
      previousEmpty = true;
      continue;
    }

    compacted.push(line);
    previousEmpty = false;
  }

  while (compacted[0] === "") {
    compacted.shift();
  }
  while (compacted[compacted.length - 1] === "") {
    compacted.pop();
  }

  return compacted.join("\n");
}

function normalizeTime(value: string): string {
  const normalized = normalizeWhitespace(value).toUpperCase();
  if (!normalized) {
    return TBA_TIME;
  }

  const timeMatch = normalized.match(/^([01]?\d|2[0-3])[:.]([0-5]\d)(?:\s*UHR)?$/);
  if (!timeMatch) {
    return TBA_TIME;
  }

  const hours = timeMatch[1].padStart(2, "0");
  const minutes = timeMatch[2];
  return `${hours}:${minutes}`;
}

function normalizeImageUrl(value: string): string {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }

  try {
    const url = new URL(normalized);

    // Carina often returns signed Flickr links (?s=...) that expire.
    // Store a stable image URL by removing temporary query/hash parts.
    if (url.hostname === "live.staticflickr.com") {
      url.search = "";
      url.hash = "";
    }

    return url.toString();
  } catch {
    return normalized;
  }
}

export function normalizeEvent(event: Event): Event {
  const normalizedImage = normalizeImageUrl(event.image ?? "");

  return {
    location: normalizeWhitespace(event.location),
    title: normalizeWhitespace(event.title).toUpperCase(),
    description: normalizeDescription(event.description),
    date: normalizeWhitespace(event.date),
    time: normalizeTime(event.time),
    event_url: normalizeWhitespace(event.event_url),
    ...(normalizedImage ? { image: normalizedImage } : {}),
  };
}

export function normalizeEvents(events: Event[]): Event[] {
  return events
    .map(normalizeEvent)
    .filter((event) => event.location && event.title && event.date && event.event_url);
}
