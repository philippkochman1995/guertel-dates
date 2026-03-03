import { normalizeEvents } from "./lib/normalize";
import { scrapeChelseaEvents } from "./scrapers/chelsea";

async function run(): Promise<void> {
  const events = normalizeEvents(await scrapeChelseaEvents());
  console.log(JSON.stringify(events, null, 2));
}

run().catch((error) => {
  console.error("Chelsea scrape failed:", error);
  process.exit(1);
});
