import { describe, expect, it } from "vitest";
import { __rhizInternals } from "../../scripts/scrapers/rhiz";

describe("rhiz scraper", () => {
  it("parses datetime from RHIZ date strings", () => {
    expect(__rhizInternals.parseDateTime("2026-03-04 19:15:00")).toEqual({
      date: "2026-03-04",
      time: "20:15",
    });

    expect(__rhizInternals.parseDateTime("2026-03-04T19:15:00Z")).toEqual({
      date: "2026-03-04",
      time: "20:15",
    });
  });

  it("extracts promotions and count from API payload", () => {
    const payload = {
      count: { total: "18" },
      data: [{ slug: "04-03-2026_film-bar", title: "Film Bar" }],
    };

    const promotions = __rhizInternals.extractPromotions(payload);
    expect(promotions).toHaveLength(1);
    expect(__rhizInternals.extractCountTotal(payload)).toBe(18);
  });

  it("maps promotion records to events", () => {
    const promotion = {
      slug: "06-03-2026_marigold-gush-valley-glut-marigold",
      title: "Marigold / Gush valley / Glut",
      start: "2026-03-06 19:00:00",
      venueName: "rhiz",
      rawEvent: JSON.stringify({
        start: { value: { dateTimeISO: "2026-03-06T19:00:00Z" } },
        subtitle: { value: { label: "Konzert der Besonderern Art" } },
        description: { value: { html: "<p>Line one<br>Line two</p>" } },
        presaleInfo: { value: { html: "<p>VVK 15 EUR</p>" } },
        lineUp: {
          value: {
            items: [
              {
                content: {
                  artist: { value: { label: "marigold" } },
                  program: { value: { label: "Live" } },
                },
              },
            ],
          },
        },
        image: {
          value: {
            file: {
              image1920: {
                href: "https://images.copilot.events/resize?instanceId=rhiz&url=example",
              },
            },
          },
        },
        presaleLink: {
          value: {
            href: "https://shop.copilot.events/rhiz/events/8a5eb0b2-67e9-4bd4-a739-fc612e61e9a3",
          },
        },
      }),
    };

    const event = __rhizInternals.parseEventFromPromotion(promotion);
    expect(event).not.toBeNull();
    expect(event).toMatchObject({
      location: "rhiz",
      title: "Marigold / Gush valley / Glut",
      date: "2026-03-06",
      time: "20:00",
      event_url: "https://rhiz.wien/?copilot-slug=06-03-2026_marigold-gush-valley-glut-marigold",
      image: "https://images.copilot.events/resize?instanceId=rhiz&url=example",
    });
    expect(event?.description).toContain("Konzert der Besonderern Art");
    expect(event?.description).toContain("Line one");
    expect(event?.description).toContain("Tickets:");
  });

  it("parses html snippets into structured text", () => {
    const text = __rhizInternals.structuredTextFromHtml("<p>A<br>B</p><p>C</p>");
    expect(text).toBe("A\nB\n\nC");
  });
});
