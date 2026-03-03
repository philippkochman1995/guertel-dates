import { normalizeEvents } from "./lib/normalize";
import { scrapeLoftEvents } from "./scrapers/loft";

async function run(): Promise<void> {
  const events = normalizeEvents(await scrapeLoftEvents());
  console.log(JSON.stringify(events, null, 2));
}

run().catch((error) => {
  console.error("Loft scrape failed:", error);
  process.exit(1);
});
