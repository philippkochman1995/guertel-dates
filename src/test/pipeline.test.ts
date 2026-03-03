import { describe, expect, it } from "vitest";
import { dedupeEvents } from "../../scripts/lib/dedupe";
import { normalizeEvents } from "../../scripts/lib/normalize";
import { parseChelseaEventsFromHtml } from "../../scripts/scrapers/chelsea";

describe("event pipeline", () => {
  it("deduplicates events based on date/time/location/title", () => {
    const deduped = dedupeEvents([
      {
        location: "Chelsea Wien",
        title: " Dives ",
        description: "A",
        date: "2026-03-01",
        time: "20:00",
        event_url: "https://example.com/1",
      },
      {
        location: "chelsea  wien",
        title: "DIVES",
        description: "B",
        date: "2026-03-01",
        time: "20:00",
        event_url: "https://example.com/2",
      },
    ]);

    expect(deduped).toHaveLength(1);
  });

  it("parses a minimal Chelsea-like HTML fixture", () => {
    const html = `
      <ul>
        <li class="concert-item">
          <p class="date">05.03.2026 20:30</p>
          <h3 class="band">Lucid Express</h3>
          <p class="text">Dream-pop night.<br><br>Second paragraph with details.</p>
        </li>
      </ul>
    `;

    const parsed = parseChelseaEventsFromHtml(html, "https://www.chelsea.co.at/concerts.php");

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      location: "Chelsea Wien",
      title: "Lucid Express",
      date: "2026-03-05",
      time: "20:30",
      event_url: "https://www.chelsea.co.at/concerts.php",
    });
    expect(parsed[0].description).toContain("\n\n");
  });

  it("removes duplicated paragraphs and repetitive ticket links", () => {
    const html = `
      <div class="concert-item">
        <p class="date">05.03.2026 20:30</p>
        <h3 class="band">257ERS (D)</h3>
        <div class="text">
          <p>Endlich erwachsen Tour 2025</p>
          <p>Die legendaeren 257ers sind zurueck.</p>
          <p>Die legendaeren 257ers sind zurueck.</p>
          <p>www.facebook.com/257ers</p>
          <p>Tickets:</p>
          <p>https://www.oeticket.com/event/257ers-endlich-erwachsen-tour-2025-chelsea-19418407/?affiliate=EOE</p>
          <p>Tickets:</p>
          <p>https://www.oeticket.com/event/257ers-endlich-erwachsen-tour-2025-chelsea-19418407/?affiliate=EOE</p>
        </div>
      </div>
    `;

    const parsed = parseChelseaEventsFromHtml(html, "https://www.chelsea.co.at/concerts.php");
    expect(parsed).toHaveLength(1);

    expect(parsed[0].description).toContain("www.facebook.com/257ers");
    expect(parsed[0].description).not.toContain("Tickets:");
    expect(parsed[0].description).not.toContain("oeticket.com");
    expect(parsed[0].description.match(/Die legendaeren 257ers sind zurueck\./g)?.length).toBe(1);
  });

  it("strips expiring query tokens from Flickr image urls", () => {
    const normalized = normalizeEvents([
      {
        location: "Cafe Carina",
        title: "Farious",
        description: "Test",
        date: "2026-03-04",
        time: "20:00",
        event_url: "https://www.cafe-carina.at/2020/events/farious/",
        image: "https://live.staticflickr.com/65535/55114497664_cbe44f8b7a_h.jpg?s=eyJpIjo1NTExNDQ5NzY2NCwiZSI6MTc3MTk2NDkzNiwicyI6ImE2OGZmYmFiM2RiOTY2ZTRiODZmYjc2ZGJiZWIzNThhOGNlYzk5MjEiLCJ2IjoxfQ",
      },
    ]);

    expect(normalized[0].image).toBe("https://live.staticflickr.com/65535/55114497664_cbe44f8b7a_h.jpg");
  });

  it("extracts first Chelsea concert image from termindetails block", () => {
    const html = `
      <table class="termindetails" cellpadding="0" cellspacing="0">
        <tr>
          <td width="200" valign="top">
            <img src="img/concert_6555_1.jpg?1761665950" />
            <img src="img/concert_6555_2.jpg?1761665980" />
            <img src="img/concert_6555_3.jpg?1769791925" />
          </td>
          <td width="10"></td>
          <td valign="top">
            <div class="date">Do, 05.03.</div>
            <div class="band"><span class="highlight">FRAUDS (UK) / VENT!L</span></div>
            <div class="text">Some text</div>
            <a href="#"><img src="img/btn_top.gif?1306140083" /></a>
          </td>
        </tr>
      </table>
    `;

    const parsed = parseChelseaEventsFromHtml(html, "https://www.chelsea.co.at/concerts.php");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].image).toBe("https://www.chelsea.co.at/img/concert_6555_1.jpg?1761665950");
  });
});
