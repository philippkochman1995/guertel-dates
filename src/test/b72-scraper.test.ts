import { describe, expect, it } from "vitest";
import { __b72Internals } from "../../scripts/scrapers/b72";

describe("b72 scraper", () => {
  it("parses B72 date formats", () => {
    expect(__b72Internals.parseB72DateToIso("08.06.2026")).toBe("2026-06-08");
    expect(__b72Internals.parseB72DateToIso("14.03", 2026)).toBe("2026-03-14");
  });

  it("extracts overview events from program markup", () => {
    const html = `
      <div class="section">
        <div class="row">
          <div class="col s12 right-align">
            <b><a href="/program/2026/">2026</a></b> | <a href="/program/2027/">2027</a>
          </div>
        </div>
        <div class="row">
          <div class="col l4 m6 s12 coming-up">
            <a href="/program/10045/Main_Concept">
              <div class="bg-image" style="background: url('https://www.b72.at/upload/main-concept.jpg') center center no-repeat;"></div>
            </a>
            <h4>14.03</h4>
            <h6><a href="/program/10045/Main_Concept">Main Concept</a></h6>
          </div>
          <div class="col l4 m6 s12 coming-up">
            <a href="/program/9866/HEAST_Hip_Hop_Open_Stage">
              <div class="bg-image" style="background: url('/img/no-image.jpg') center center no-repeat;"></div>
            </a>
            <h4>19.03</h4>
            <h6><a href="/program/9866/HEAST_Hip_Hop_Open_Stage">HEAST! Hip Hop Open Stage</a></h6>
          </div>
        </div>
      </div>
    `;

    const events = __b72Internals.extractOverviewEventsFromHtml(html, "https://www.b72.at/program");
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      title: "Main Concept",
      date: "2026-03-14",
      url: "https://www.b72.at/program/10045/Main_Concept",
      image: "https://www.b72.at/upload/main-concept.jpg",
    });
    expect(events[1]).toMatchObject({
      title: "HEAST! Hip Hop Open Stage",
      date: "2026-03-19",
      url: "https://www.b72.at/program/9866/HEAST_Hip_Hop_Open_Stage",
    });
    expect(events[1].image).toBeUndefined();
  });

  it("extracts detail data", () => {
    const html = `
      <div class="section">
        <div class="show-detail">
          <h1>Siluh Soiree #11 - live: PREWN</h1>
          <b><span class="date">08.06.2026</span> 20:00</b>
        </div>
        <img src="https://www.b72.at/upload/siluh.jpeg" class="responsive-img" />
        <p>Line one.</p>
        <p>Line two.</p>
      </div>
    `;

    const parsed = __b72Internals.extractDetailEventData(html, {
      title: "Fallback",
      date: "2026-06-08",
      time: "TBA",
      url: "https://www.b72.at/program/10202/Siluh_Soire_11__live_PREW",
      image: "",
    });

    expect(parsed).toMatchObject({
      location: "B72",
      title: "Siluh Soiree #11 - live: PREWN",
      date: "2026-06-08",
      time: "20:00",
      event_url: "https://www.b72.at/program/10202/Siluh_Soire_11__live_PREW",
      image: "https://www.b72.at/upload/siluh.jpeg",
    });
    expect(parsed?.description).toBe("Line one.\n\nLine two.");
  });
});
