import { normalizeEvents } from "./lib/normalize";
import { scrapeCarinaEvents } from "./scrapers/carina";

async function run(): Promise<void> {
  const events = normalizeEvents(await scrapeCarinaEvents());
  console.log(JSON.stringify(events, null, 2));
}

run().catch((error) => {
  console.error("Carina scrape failed:", error);
  process.exit(1);
});
