import { normalizeEvents } from "./lib/normalize";
import { scrapeKramladenEvents } from "./scrapers/kramladen";

async function run(): Promise<void> {
  const events = normalizeEvents(await scrapeKramladenEvents());
  console.log(JSON.stringify(events, null, 2));
}

run().catch((error) => {
  console.error("Kramladen scrape failed:", error);
  process.exit(1);
});
