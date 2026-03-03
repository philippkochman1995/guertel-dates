import { normalizeEvents } from "./lib/normalize";
import { scrapeWeberknechtEvents } from "./scrapers/weberknecht";

async function run(): Promise<void> {
  const events = normalizeEvents(await scrapeWeberknechtEvents());
  console.log(JSON.stringify(events, null, 2));
}

run().catch((error) => {
  console.error("Weberknecht scrape failed:", error);
  process.exit(1);
});
