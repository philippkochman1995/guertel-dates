import { describe, expect, it } from "vitest";
import { __concertoInternals } from "../../scripts/scrapers/concerto";

describe("concerto scraper", () => {
  it("parses day-month date to ISO", () => {
    const parsed = __concertoInternals.parseConcertoDateToIso("Mi. 04.03.", {
      now: new Date("2026-03-01T12:00:00+01:00"),
    });
    expect(parsed).toBe("2026-03-04");
  });

  it("extracts overview events from grouped list markup", () => {
    const html = `
      <div class="item-list">
        <h3><span class="date-display-single">Mi. 04.03.</span></h3>
        <ul>
          <li class="views-row">
            <div class="views-field views-field-field-bild">
              <span class="field-content eventlist_thumbnail">
                <img src="/files/styles/thumbnail/public/test.jpg" />
              </span>
            </div>
            <div class="views-field views-field-field-raum">
              <div class="field-content"><span class="date-display-single">21:00</span> @ <a href="/raum/felsenkeller">Felsenkeller</a></div>
            </div>
            <div class="views-field views-field-title">
              <span class="field-content">
                <a href="/event/jazz-session-test"></a>
                <h4>
                  <a href="/event/jazz-session-test"></a>
                  <a href="node/1234">Jazz Session Test</a>
                </h4>
              </span>
            </div>
            <div class="views-field views-field-field-untertitel">
              <strong class="field-content">Samba Funk Jazz</strong>
            </div>
            <div class="views-field views-field-field-eintritt">
              <div class="field-content">Eintritt: freie Spende</div>
            </div>
          </li>
        </ul>
      </div>
    `;

    const events = __concertoInternals.extractOverviewEventsFromHtml(
      html,
      "https://www.cafeconcerto.at/termine",
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "Jazz Session Test",
      date: "2026-03-04",
      time: "21:00",
      location: "CAFE CONCERTO FELSENKELLER",
      url: "https://www.cafeconcerto.at/event/jazz-session-test",
      image: "https://www.cafeconcerto.at/files/styles/thumbnail/public/test.jpg",
    });
    expect(events[0].description).toContain("Samba Funk Jazz");
  });

  it("extracts detail data with subtitle, body and lineup", () => {
    const detailHtml = `
      <html>
        <body>
          <h1 class="page-title">Jazz Session with Friends</h1>
          <div class="field-name-field-date"><span class="date-display-single">Mi. 04.03. - 21:00</span></div>
          <div class="field-name-field-raum"><div class="field-item">Felsenkeller</div></div>
          <div class="field-name-field-untertitel"><div class="field-item">Samba Funk Jazz</div></div>
          <div class="field-name-field-eintritt"><div class="field-item">freie Spende</div></div>
          <div class="field-name-body"><div class="field-item"><p>bring your voice</p><p>weekly session</p></div></div>
          <div class="field-name-field-lineup"><div class="field-item"><p>Player A</p><p>Player B</p></div></div>
          <div class="field-name-field-bild"><img src="/files/styles/calendar/public/cover.jpg" /></div>
        </body>
      </html>
    `;

    const parsed = __concertoInternals.extractDetailEventData(detailHtml, {
      title: "Fallback",
      description: "",
      date: "2026-03-04",
      time: "21:00",
      location: "Cafe Concerto",
      url: "https://www.cafeconcerto.at/event/jazz-session-with-friends",
      image: "",
    });

    expect(parsed).toMatchObject({
      title: "Jazz Session with Friends",
      date: "2026-03-04",
      time: "21:00",
      location: "CAFE CONCERTO FELSENKELLER",
      event_url: "https://www.cafeconcerto.at/event/jazz-session-with-friends",
      image: "https://www.cafeconcerto.at/files/styles/calendar/public/cover.jpg",
    });
    expect(parsed?.description).toContain("Lineup:");
    expect(parsed?.description).toContain("Eintritt: freie Spende");
  });

  it("extracts pagination urls", () => {
    const html = `
      <ul class="pager">
        <li><a href="/termine?page=1">2</a></li>
        <li><a href="/termine?page=2">3</a></li>
      </ul>
    `;

    const urls = __concertoInternals.extractPaginationUrlsFromHtml(
      html,
      "https://www.cafeconcerto.at/termine",
    );

    expect(urls).toEqual([
      "https://www.cafeconcerto.at/termine",
      "https://www.cafeconcerto.at/termine?page=1",
      "https://www.cafeconcerto.at/termine?page=2",
    ]);
  });
});
