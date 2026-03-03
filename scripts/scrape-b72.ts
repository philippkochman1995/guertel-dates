import { normalizeEvents } from "./lib/normalize";
import { scrapeB72Events } from "./scrapers/b72";

async function run(): Promise<void> {
  const events = normalizeEvents(await scrapeB72Events());
  console.log(JSON.stringify(events, null, 2));
}

run().catch((error) => {
  console.error("B72 scrape failed:", error);
  process.exit(1);
});
