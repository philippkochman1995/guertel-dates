import { describe, expect, it } from "vitest";
import { __g5Internals } from "../../scripts/scrapers/g5";

describe("g5 scraper", () => {
  it("parses german list date and 12h time to ISO + 24h", () => {
    const date = __g5Internals.parseG5DateToIso("Di., 03 März,", {
      now: new Date("2026-03-01T12:00:00+01:00"),
    });
    const time = __g5Internals.parseG5Time("07:00 PM – 11:45 PM");

    expect(date).toBe("2026-03-03");
    expect(time).toBe("19:00");
  });

  it("extracts overview events and max pages from list markup", () => {
    const html = `
      <div class="ep-event-list-item">
        <a class="ep-fs-5 ep-fw-bold ep-text-dark" data-event-id="1720" href="https://g5musicgroup.at/all-events/?event=1720">
          G5 Rock Night
        </a>
        <div class="ep-mb-2 ep-text-small ep-text-muted ep-text-truncate">G5 - Live Music Bar</div>
        <div class="ep-event-list-view-action">
          <span class="ep-event-date">Di., 03 März,</span>
          <span>07:00 PM</span>
        </div>
        <div class="ep-box-list-desc">LIVE - Cravings / Mad Prophet / Midnight Fever</div>
        <img src="https://g5musicgroup.at/wp-content/uploads/2026/01/03.03.2026-Flyer-3.jpg" />
      </div>
      <button id="ep-loadmore-events" data-max="4"></button>
    `;

    const events = __g5Internals.extractOverviewEventsFromHtml(html, "https://g5musicgroup.at/all-events/");
    const maxPages = __g5Internals.extractMaxPagesFromHtml(html);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "G5 Rock Night",
      url: "https://g5musicgroup.at/all-events/?event=1720",
      date: "2026-03-03",
      time: "19:00",
      location: "G5 - Live Music Bar",
      image: "https://g5musicgroup.at/wp-content/uploads/2026/01/03.03.2026-Flyer-3.jpg",
    });
    expect(maxPages).toBe(4);
  });

  it("merges detail script data into final event structure", () => {
    const detailHtml = `
      <script id="ep-event-single-script-js-extra">
        var em_front_event_object = {
          "em_event_data": {
            "event": {
              "event": {
                "name": "G5 Rock Night",
                "description": "LIVE - Cravings / Mad Prophet / Midnight Fever",
                "event_url": "https://g5musicgroup.at/all-events/?event=1720",
                "em_start_date_time": "1772560800",
                "em_start_time": "07:00 PM",
                "venue_details": {
                  "name": "G5 - Live Music Bar"
                },
                "image_url": "https://g5musicgroup.at/wp-content/uploads/2026/01/03.03.2026-Flyer-3.jpg"
              }
            }
          }
        };
      </script>
    `;

    const parsed = __g5Internals.parseDetailEventDataFromHtml(detailHtml, {
      title: "Fallback Title",
      url: "https://g5musicgroup.at/all-events/?event=1720",
      date: "2026-03-03",
      time: "19:00",
      location: "Fallback Location",
      description: "",
      image: "",
    });

    expect(parsed).toMatchObject({
      location: "G5 - Live Music Bar",
      title: "G5 Rock Night",
      description: "LIVE - Cravings / Mad Prophet / Midnight Fever",
      date: "2026-03-03",
      time: "19:00",
      event_url: "https://g5musicgroup.at/all-events/?event=1720",
      image: "https://g5musicgroup.at/wp-content/uploads/2026/01/03.03.2026-Flyer-3.jpg",
    });
  });
});
