import { describe, expect, it } from "vitest";
import { __loftInternals } from "../../scripts/scrapers/loft";

describe("loft scraper", () => {
  it("parses loft dates to ISO", () => {
    expect(__loftInternals.parseLoftDateToIso("Di. 3.3.2026")).toBe("2026-03-03");
    expect(__loftInternals.parseLoftDateToIso("20260303T19:00:00")).toBe("2026-03-03");
  });

  it("extracts overview events from shortcode boxes", () => {
    const html = `
      <div class="elementor-shortcode">
        <a href="https://www.theloft.at/solidragity-7/">
          <div class="box-wrap">
            <div class="content-left">
              <div class="datum">Di. 3.3.2026</div>
              <span class="open">19:00</span>
            </div>
            <div class="content-middle">Solidragity</div>
            <div class="content-right">Wohnzimmer</div>
          </div>
        </a>
      </div>
    `;

    const events = __loftInternals.extractOverviewEventsFromHtml(
      html,
      "https://www.theloft.at/programm/",
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "Solidragity",
      date: "2026-03-03",
      time: "19:00",
      location: "LOFT WOHNZIMMER",
      url: "https://www.theloft.at/solidragity-7/",
    });
  });

  it("extracts detail event data with JSON-LD and post content", () => {
    const html = `
      <html>
        <head>
          <meta property="og:image" content="https://www.theloft.at/wp-content/uploads/2026/01/solidragity.jpg" />
          <script type="application/ld+json">
            {"@context":"https://schema.org","@type":"MusicEvent","name":"Solidragity","startDate":"20260303T19:00:00"}
          </script>
        </head>
        <body>
          <h1 class="elementor-heading-title">Solidragity</h1>
          <div id="datum-und-preis">
            <span class="elementor-post-info__terms-list-item">Wohnzimmer</span>
          </div>
          <div class="elementor-widget-theme-post-content">
            <div class="elementor-widget-container">
              <p>Line one.</p>
              <p>Line two.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const parsed = __loftInternals.extractDetailEventData(html, {
      title: "Fallback",
      date: "2026-03-03",
      time: "TBA",
      location: "The Loft",
      url: "https://www.theloft.at/solidragity-7/",
    });

    expect(parsed).toMatchObject({
      location: "LOFT WOHNZIMMER",
      title: "Solidragity",
      date: "2026-03-03",
      time: "19:00",
      event_url: "https://www.theloft.at/solidragity-7/",
      image: "https://www.theloft.at/wp-content/uploads/2026/01/solidragity.jpg",
    });
    expect(parsed?.description).toBe("Line one.\n\nLine two.");
  });
});
