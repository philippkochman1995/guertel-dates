import type { Event } from "../types";
import { normalizeWhitespace } from "./normalize";

function eventKey(event: Event): string {
  const location = normalizeWhitespace(event.location).toLowerCase();
  const title = normalizeWhitespace(event.title).toLowerCase();
  const date = normalizeWhitespace(event.date);
  const time = normalizeWhitespace(event.time);
  return `${date}|${time}|${location}|${title}`;
}

export function dedupeEvents(events: Event[]): Event[] {
  const byKey = new Map<string, Event>();

  for (const event of events) {
    const key = eventKey(event);
    if (!byKey.has(key)) {
      byKey.set(key, event);
    }
  }

  return Array.from(byKey.values());
}
