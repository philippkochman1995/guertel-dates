import { normalizeEvents } from "./lib/normalize";
import { scrapeConcertoEvents } from "./scrapers/concerto";

async function run(): Promise<void> {
  const events = normalizeEvents(await scrapeConcertoEvents());
  console.log(JSON.stringify(events, null, 2));
}

run().catch((error) => {
  console.error("Concerto scrape failed:", error);
  process.exit(1);
});
