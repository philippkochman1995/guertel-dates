import { describe, expect, it } from "vitest";
import { __loopInternals } from "../../scripts/scrapers/loop";

describe("loop scraper", () => {
  it("extracts events from JSON-LD list data", () => {
    const html = `
      <html>
        <body>
          <script type="application/ld+json">
            [
              {
                "@context": "http://schema.org",
                "@type": "Event",
                "name": "The Test Event",
                "description": "<p>Visible teaser text &amp; more</p>",
                "url": "/event/the-test-event/",
                "startDate": "2026-03-11T20:30:00+01:00",
                "image": "https://loop.co.at/image.jpg",
                "location": {
                  "@type": "Place",
                  "name": "Loop Bar"
                }
              }
            ]
          </script>
        </body>
      </html>
    `;

    const events = __loopInternals.extractOverviewEventsFromHtml(html, "https://loop.co.at/events/liste/");

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "The Test Event",
      description: "Visible teaser text & more",
      date: "2026-03-11",
      time: "20:30",
      url: "https://loop.co.at/event/the-test-event/",
      image: "https://loop.co.at/image.jpg",
      location: "Loop Bar",
    });
  });

  it("extracts next page url from tribe view data", () => {
    const html = `
      <script data-js="tribe-events-view-data" type="application/json">
        {"next_url":"https:\\/\\/loop.co.at\\/events\\/liste\\/seite\\/2\\/"}
      </script>
    `;

    const next = __loopInternals.extractNextPageUrlFromHtml(html, "https://loop.co.at/events/liste/");
    expect(next).toBe("https://loop.co.at/events/liste/seite/2/");
  });
});
