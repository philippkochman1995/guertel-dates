import { describe, expect, it } from "vitest";
import { __weberknechtInternals } from "../../scripts/scrapers/weberknecht";

describe("weberknecht scraper", () => {
  it("extracts overview events from list rows", () => {
    const html = `
      <article class="tribe-events-calendar-list__event">
        <a class="tribe-events-calendar-list__event-featured-image-link" href="/event/test-event/">
          <img class="tribe-events-calendar-list__event-featured-image" data-src="/wp-content/uploads/test.jpg" />
        </a>
        <time class="tribe-events-calendar-list__event-datetime" datetime="2026-03-06">
          <span class="tribe-event-date-start">6 März @ 22:00</span>
        </time>
        <h3 class="tribe-events-calendar-list__event-title">
          <a class="tribe-events-calendar-list__event-title-link" href="/event/test-event/">Test Event</a>
        </h3>
        <div class="tribe-events-calendar-list__event-description"><p>Short teaser text.</p></div>
      </article>
    `;

    const events = __weberknechtInternals.extractOverviewEventsFromHtml(
      html,
      "https://weberknecht.net/events/",
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "Test Event",
      url: "https://weberknecht.net/event/test-event/",
      date: "2026-03-06",
      time: "22:00",
      description: "Short teaser text.",
      image: "https://weberknecht.net/wp-content/uploads/test.jpg",
    });
  });

  it("extracts next page url from tribe view data", () => {
    const html = `
      <script data-js="tribe-events-view-data" type="application/json">
        {"next_url":"https:\\/\\/weberknecht.net\\/events\\/liste\\/page\\/2\\/"}
      </script>
    `;

    const next = __weberknechtInternals.extractNextPageUrlFromHtml(
      html,
      "https://weberknecht.net/events/",
    );
    expect(next).toBe("https://weberknecht.net/events/liste/page/2/");
  });

  it("extracts detail data from single event page", () => {
    const html = `
      <html>
        <head>
          <meta property="og:image" content="https://weberknecht.net/wp-content/uploads/detail.jpg" />
          <script type="application/ld+json">
            [{"@type":"Event","name":"80er-ZONE im März","startDate":"2026-03-06T22:00:00+01:00"}]
          </script>
        </head>
        <body>
          <h1 class="tribe-events-single-event-title">80er-ZONE im März</h1>
          <div class="tribe-events-single-event-description tribe-events-content">
            <p>Line one.</p>
            <p>Line two.</p>
          </div>
          <abbr class="tribe-events-start-datetime" title="2026-03-06">6 März @ 22:00</abbr>
        </body>
      </html>
    `;

    const parsed = __weberknechtInternals.extractDetailEventData(html, {
      title: "Fallback Title",
      url: "https://weberknecht.net/event/80er-zone-im-maerz/",
      date: "2026-03-06",
      time: "22:00",
      description: "Fallback description",
      image: "",
    });

    expect(parsed).toMatchObject({
      location: "Weberknecht",
      title: "80er-ZONE im März",
      date: "2026-03-06",
      time: "22:00",
      event_url: "https://weberknecht.net/event/80er-zone-im-maerz/",
      image: "https://weberknecht.net/wp-content/uploads/detail.jpg",
    });
    expect(parsed.description).toBe("Line one.\n\nLine two.");
  });
});
