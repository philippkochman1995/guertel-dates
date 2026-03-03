import { normalizeEvents } from "./lib/normalize";
import { scrapeG5Events } from "./scrapers/g5";

async function run(): Promise<void> {
  const events = normalizeEvents(await scrapeG5Events());
  console.log(JSON.stringify(events, null, 2));
}

run().catch((error) => {
  console.error("G5 scrape failed:", error);
  process.exit(1);
});
