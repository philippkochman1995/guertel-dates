import { describe, expect, it } from "vitest";
import { __luciaInternals } from "../../scripts/scrapers/lucia";

describe("lucia scraper", () => {
  it("parses german date to ISO", () => {
    expect(__luciaInternals.parseLuciaDateToIso("02 März 2026")).toBe("2026-03-02");
    expect(__luciaInternals.parseLuciaDateToIso("14.10.2026")).toBe("2026-10-14");
  });

  it("extracts overview events from listing items", () => {
    const html = `
      <ul class="event_listings">
        <li class="event_listing">
          <h3><a href="/de/event/test-night/">Test Night</a></h3>
          <div class="event-date">03 März 2026</div>
          <img data-src="/wp-content/uploads/test.jpg" />
        </li>
      </ul>
    `;

    const events = __luciaInternals.extractOverviewEventsFromHtml(
      html,
      "https://www.clublucia.at/de/veranstaltungen/",
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "Test Night",
      url: "https://www.clublucia.at/de/event/test-night/",
      date: "2026-03-03",
      image: "https://www.clublucia.at/wp-content/uploads/test.jpg",
    });
  });

  it("extracts detail data with description and fallbacks", () => {
    const detailHtml = `
      <html>
        <head>
          <meta property="og:description" content="Fallback description" />
        </head>
        <body>
          <h1>Detail Event</h1>
          <time datetime="2026-03-04T20:30:00+01:00">04 März 2026 20:30</time>
          <div class="entry-content"><p>Paragraph one.</p><p>Paragraph two.</p></div>
        </body>
      </html>
    `;

    const parsed = __luciaInternals.extractDetailEventData(detailHtml, {
      title: "Overview Event",
      url: "https://www.clublucia.at/de/event/detail-event/",
      date: "2026-03-04",
      image: "",
    });

    expect(parsed).toMatchObject({
      location: "Club Lucia",
      title: "Detail Event",
      date: "2026-03-04",
      time: "20:30",
      event_url: "https://www.clublucia.at/de/event/detail-event/",
    });
    expect(parsed?.description).toBe("Paragraph one.\n\nParagraph two.");
  });

  it("prefers JSON-LD event startDate for date/time", () => {
    const detailHtml = `
      <html>
        <head>
          <script type="application/ld+json">
            {"@type":"Event","startDate":"2026-03-24T20:00:00+01:00"}
          </script>
        </head>
        <body>
          <h1>Rock & Psych Event</h1>
          <div class="entry-content"><p>Some text.</p></div>
        </body>
      </html>
    `;

    const parsed = __luciaInternals.extractDetailEventData(detailHtml, {
      title: "Fallback Title",
      url: "https://www.clublucia.at/de/event/rock-psych-onioroshi-the-liquid-stones-vkgoes-wild-2/",
      date: "2026-02-16",
      image: "",
    });

    expect(parsed).toMatchObject({
      date: "2026-03-24",
      time: "20:00",
    });
  });

  it("uses detail page image when overview image is missing", () => {
    const detailHtml = `
      <html>
        <head>
          <meta property="og:image" content="https://www.clublucia.at/wp-content/uploads/lucia-test.jpg" />
        </head>
        <body>
          <h1>Image Test Event</h1>
          <time datetime="2026-03-10T20:00:00+01:00">10 März 2026 20:00</time>
          <div class="entry-content"><p>Hello.</p></div>
        </body>
      </html>
    `;

    const parsed = __luciaInternals.extractDetailEventData(detailHtml, {
      title: "Fallback Title",
      url: "https://www.clublucia.at/de/event/image-test/",
      date: "2026-03-10",
      image: "",
    });

    expect(parsed).toMatchObject({
      image: "https://www.clublucia.at/wp-content/uploads/lucia-test.jpg",
    });
  });

  it("builds pagination urls", () => {
    expect(__luciaInternals.getPaginationUrl(1)).toBe("https://www.clublucia.at/de/veranstaltungen/");
    expect(__luciaInternals.getPaginationUrl(2)).toBe("https://www.clublucia.at/de/veranstaltungen/page/2/");
  });

  it("extracts event urls from anchor fallback", () => {
    const html = `
      <div>
        <a href="/de/event/my-band-night/">My Band Night</a>
        <a href="/de/event/another-show/"> </a>
      </div>
    `;

    const events = __luciaInternals.extractOverviewEventsFromAnchorFallback(
      html,
      "https://www.clublucia.at/de/veranstaltungen/",
    );

    expect(events).toHaveLength(2);
    expect(events[0].url).toBe("https://www.clublucia.at/de/event/my-band-night/");
    expect(events[1].title).toBe("Another Show");
  });

  it("extracts loc urls from sitemap xml", () => {
    const xml = `
      <urlset>
        <url><loc>https://www.clublucia.at/de/event/test-a/</loc></url>
        <url><loc>https://www.clublucia.at/de/event/test-b/</loc></url>
      </urlset>
    `;

    const urls = __luciaInternals.extractLocUrlsFromXml(
      xml,
      "https://www.clublucia.at/wp-sitemap-posts-post-1.xml",
    );
    expect(urls).toEqual([
      "https://www.clublucia.at/de/event/test-a/",
      "https://www.clublucia.at/de/event/test-b/",
    ]);
  });
});
