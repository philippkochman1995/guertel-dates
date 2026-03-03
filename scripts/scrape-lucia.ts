import { normalizeEvents } from "./lib/normalize";
import { scrapeLuciaEvents } from "./scrapers/lucia";

async function run(): Promise<void> {
  const events = normalizeEvents(await scrapeLuciaEvents());
  console.log(JSON.stringify(events, null, 2));
}

run().catch((error) => {
  console.error("Lucia scrape failed:", error);
  process.exit(1);
});
