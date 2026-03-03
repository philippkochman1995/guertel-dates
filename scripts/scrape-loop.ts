import { normalizeEvents } from "./lib/normalize";
import { scrapeLoopEvents } from "./scrapers/loop";

async function run(): Promise<void> {
  const events = normalizeEvents(await scrapeLoopEvents());
  console.log(JSON.stringify(events, null, 2));
}

run().catch((error) => {
  console.error("Loop scrape failed:", error);
  process.exit(1);
});
