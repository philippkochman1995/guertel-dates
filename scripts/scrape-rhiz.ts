import { normalizeEvents } from "./lib/normalize";
import { scrapeRhizEvents } from "./scrapers/rhiz";

async function run(): Promise<void> {
  const events = normalizeEvents(await scrapeRhizEvents());
  console.log(JSON.stringify(events, null, 2));
}

run().catch((error) => {
  console.error("RHIZ scrape failed:", error);
  process.exit(1);
});
