import type { Event } from "@/types/event";
import { addDaysToIsoDateInUtc, getHourInTimeZone, getTodayISOInTimeZone } from "@/lib/dates";

const TBA_TIME = "TBA";
const PREVIOUS_DAY_VISIBILITY_UNTIL_HOUR = 6;

function timeToMinutes(time: string): number {
  const normalized = time.trim().toUpperCase();
  if (!normalized || normalized === TBA_TIME) {
    return Number.MAX_SAFE_INTEGER;
  }

  const match = normalized.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

export function compareEventsChronologically(a: Event, b: Event): number {
  const dateCompare = a.date.localeCompare(b.date);
  if (dateCompare !== 0) {
    return dateCompare;
  }

  return timeToMinutes(a.time) - timeToMinutes(b.time);
}

export function filterFutureEvents(events: Event[], timeZone: string, now = new Date()): Event[] {
  const todayIso = getTodayISOInTimeZone(timeZone, now);
  const localHour = getHourInTimeZone(timeZone, now);
  const earliestVisibleDate =
    localHour < PREVIOUS_DAY_VISIBILITY_UNTIL_HOUR
      ? addDaysToIsoDateInUtc(todayIso, -1)
      : todayIso;

  return events.filter((event) => event.date >= earliestVisibleDate);
}

export function groupEventsByDate(events: Event[]): Map<string, Event[]> {
  const groups = new Map<string, Event[]>();
  for (const event of events) {
    const existing = groups.get(event.date) ?? [];
    existing.push(event);
    groups.set(event.date, existing);
  }
  return groups;
}
