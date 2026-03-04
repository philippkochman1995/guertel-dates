import { describe, expect, it } from "vitest";
import { __kramladenInternals } from "../../scripts/scrapers/kramladen";

describe("kramladen scraper", () => {
  it("detects missing Playwright browser executable errors", () => {
    const error = new Error(
      "browserType.launch: Executable doesn't exist at /tmp/chrome\nPlease run: npx playwright install",
    );

    expect(__kramladenInternals.isMissingPlaywrightBrowserError(error)).toBe(true);
    expect(__kramladenInternals.isMissingPlaywrightBrowserError(new Error("random failure"))).toBe(false);
  });

  it("parses datetime from ISO-like and english strings", () => {
    expect(__kramladenInternals.parseDateTime("2026-03-07T20:00")).toEqual({
      date: "2026-03-07",
      time: "20:00",
    });

    expect(__kramladenInternals.parseDateTime("March 07, 2026 8:00 PM")).toEqual({
      date: "2026-03-07",
      time: "20:00",
    });
  });

  it("extracts overview events from sociablekit markup", () => {
    const html = `
      <div class="sk-event-item" data-id="2514592112254443-2514592112254443">
        <div class="sk-event-item-thumbnail">
          <img src="https://data-image.sociablekit.com/sources/facebook-page-events/kramladen.wien/2514592112254443.webp" />
        </div>
        <p class="sk-event-item-title">LIVE: VIVIN und AU SALON</p>
        <time class="icon_text" datetime="2026-03-07T20:00">March 07, 2026 8:00 PM</time>
        <span class="--sk-venue">Kramladen</span>
        <address class="--sk-location">U-Bahnbogen 39-40, Wien</address>
        <div class="sk-event-item-desc"><div>Line one.</div><div>Line two.</div></div>
      </div>
    `;

    const events = __kramladenInternals.extractOverviewEventsFromHtml(html, "https://www.kramladenvienna.at/");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "2514592112254443",
      title: "LIVE: VIVIN und AU SALON",
      date: "2026-03-07",
      time: "20:00",
      location: "Kramladen",
      event_url: "https://facebook.com/events/2514592112254443",
      image: "https://data-image.sociablekit.com/sources/facebook-page-events/kramladen.wien/2514592112254443.webp",
    });
    expect(events[0].description).toBe("Line one.\n\nLine two.");
  });

  it("extracts events from escaped html candidates", () => {
    const raw = `
      <html>
        <body>
          <p>&lt;div class="sk-event-item" data-id="1952085932042356-1952085932042356"&gt;
          &lt;p class="sk-event-item-title"&gt;SILVIO SINZINGER TRIO&lt;/p&gt;
          &lt;time class="icon_text" datetime="2026-03-03T19:30"&gt;March 03, 2026 7:30 PM&lt;/time&gt;
          &lt;span class="--sk-venue"&gt;Kramladen&lt;/span&gt;
          &lt;div class="sk-event-item-desc"&gt;&lt;div&gt;Entry \\'8015,-&lt;/div&gt;&lt;/div&gt;
          &lt;/div&gt;</p>
        </body>
      </html>
    `;

    const candidates = __kramladenInternals.getHtmlCandidates(raw);
    const extracted = candidates.flatMap((candidate) =>
      __kramladenInternals.extractOverviewEventsFromHtml(candidate, "https://www.kramladenvienna.at/"));

    expect(extracted.length).toBeGreaterThan(0);
    expect(extracted[0]).toMatchObject({
      id: "1952085932042356",
      title: "SILVIO SINZINGER TRIO",
      date: "2026-03-03",
      time: "19:30",
      event_url: "https://facebook.com/events/1952085932042356",
    });
    expect(extracted[0].description).toContain("Entry");
  });

  it("extracts events from javascript-escaped html candidates", () => {
    const raw = `
      <html><body>
        <script>
          document.write("<div class=\\\"sk-event-item\\\" data-id=\\\"2514592112254443-2514592112254443\\\">\
            <p class=\\\"sk-event-item-title\\\">LIVE: VIVIN und AU SALON</p>\
            <time class=\\\"icon_text\\\" datetime=\\\"2026-03-07T20:00\\\">March 07, 2026 8:00 PM</time>\
            <span class=\\\"--sk-venue\\\">Kramladen</span>\
            <div class=\\\"sk-event-item-desc\\\"><div>Line one.</div></div>\
          </div>");
        </script>
      </body></html>
    `;

    const candidates = __kramladenInternals.getHtmlCandidates(raw);
    const extracted = candidates.flatMap((candidate) =>
      __kramladenInternals.extractOverviewEventsFromHtml(candidate, "https://www.kramladenvienna.at/"));

    expect(extracted.length).toBeGreaterThan(0);
    expect(extracted[0]?.event_url).toBe("https://facebook.com/events/2514592112254443");
  });

  it("extracts sociablekit urls from html sources", () => {
    const html = `
      <div class="sk-fb-event" data-embed-id="25537003"></div>
      <script src="//widgets.sociablekit.com/facebook-page-events/widget.js"></script>
    `;

    const urls = __kramladenInternals.extractSociableKitUrls(html, "https://www.kramladenvienna.at/");
    expect(urls).toContain("https://widgets.sociablekit.com/facebook-page-events/widget.js");
    expect(urls).toContain("https://widgets.sociablekit.com/facebook-page-events/iframe/25537003");
  });

  it("extracts sociablekit api candidates from image and api references", () => {
    const html = `
      <img src="https://data-image.sociablekit.com/sources/facebook-page-events/kramladen.wien/2514592112254443.webp" />
      <script>
        const endpoint = "https://api.sociablekit.com/sources/facebook-page-events/kramladen.wien";
      </script>
    `;

    const urls = __kramladenInternals.extractSociableKitApiUrls(html, "https://www.kramladenvienna.at/");
    expect(urls).toContain("https://api.sociablekit.com/sources/facebook-page-events/kramladen.wien");
    expect(urls).toContain("https://api.sociablekit.com/sources/facebook-page-events/kramladen.wien.json");
  });

  it("extracts events from sociablekit json payload", () => {
    const payload = {
      events: [
        {
          id: "2514592112254443",
          title: "LIVE: VIVIN und AU SALON",
          datetime: "2026-03-07T20:00",
          venue: "Kramladen",
          description: "Line one.\n\nLine two.",
          image: "https://data-image.sociablekit.com/sources/facebook-page-events/kramladen.wien/2514592112254443.webp",
          event_url: "https://facebook.com/events/2514592112254443",
        },
      ],
    };

    const events = __kramladenInternals.extractEventsFromJsonPayload(payload);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "2514592112254443",
      title: "LIVE: VIVIN und AU SALON",
      date: "2026-03-07",
      time: "20:00",
      location: "Kramladen",
      event_url: "https://facebook.com/events/2514592112254443",
    });
  });
});
