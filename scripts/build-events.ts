import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { dedupeEvents } from "./lib/dedupe";
import { getTodayISOInTimeZone, VIENNA_TIME_ZONE } from "./lib/date";
import { normalizeEvents } from "./lib/normalize";
import { validateEvents } from "./lib/validate";
import { scrapeChelseaEvents } from "./scrapers/chelsea";
import { scrapeCarinaEvents } from "./scrapers/carina";
import { scrapeB72Events } from "./scrapers/b72";
import { scrapeConcertoEvents } from "./scrapers/concerto";
import { scrapeKramladenEvents } from "./scrapers/kramladen";
import { scrapeLuciaEvents } from "./scrapers/lucia";
import { scrapeLoopEvents } from "./scrapers/loop";
import { scrapeLoftEvents } from "./scrapers/loft";
import { scrapeRhizEvents } from "./scrapers/rhiz";
import { scrapeWeberknechtEvents } from "./scrapers/weberknecht";
import { scrapeG5Events } from "./scrapers/g5";
import type { Event } from "./types";

const OUTPUT_PATH = path.resolve(process.cwd(), "src/data/events.json");

function timeToMinutes(value: string): number {
  const match = value.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

function sortEvents(events: Event[]): Event[] {
  return [...events].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    return timeToMinutes(a.time) - timeToMinutes(b.time);
  });
}

function filterFutureEvents(events: Event[]): Event[] {
  const todayIso = getTodayISOInTimeZone(VIENNA_TIME_ZONE);
  return events.filter((event) => event.date >= todayIso);
}

async function run(): Promise<void> {
  const [chelsea, carina, b72, concerto, kramladen, lucia, loop, loft, rhiz, weberknecht, g5] = await Promise.all([
    scrapeChelseaEvents(),
    scrapeCarinaEvents(),
    scrapeB72Events(),
    scrapeConcertoEvents(),
    scrapeKramladenEvents(),
    scrapeLuciaEvents(),
    scrapeLoopEvents(),
    scrapeLoftEvents(),
    scrapeRhizEvents(),
    scrapeWeberknechtEvents(),
    scrapeG5Events(),
  ]);
  const scraped = [...chelsea, ...carina, ...b72, ...concerto, ...kramladen, ...lucia, ...loop, ...loft, ...rhiz, ...weberknecht, ...g5];
  const normalized = normalizeEvents(scraped);
  const deduped = dedupeEvents(normalized);
  const filtered = filterFutureEvents(deduped);
  const sorted = sortEvents(filtered);
  const validated = validateEvents(sorted);

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(validated, null, 2)}\n`, "utf8");

  console.log(`Built ${validated.length} upcoming event(s) to ${OUTPUT_PATH}`);
}

run().catch((error) => {
  console.error("Event build failed:", error);
  process.exit(1);
});
