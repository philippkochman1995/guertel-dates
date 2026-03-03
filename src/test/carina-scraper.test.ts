import { describe, expect, it } from "vitest";
import { __carinaInternals } from "../../scripts/scrapers/carina";

describe("carina scraper", () => {
  it("parses German month date to ISO", () => {
    expect(__carinaInternals.parseCarinaDateToIso("02 März 2026")).toBe("2026-03-02");
    expect(__carinaInternals.parseCarinaDateToIso("14 Oktober 2026")).toBe("2026-10-14");
  });

  it("extracts overview events from article container", () => {
    const html = `
      <article class="mec-event-article">
        <div class="mec-event-date">02 März 2026</div>
        <h4 class="mec-event-title"><a href="/2020/events/test-event/">Monday Music</a></h4>
        <div class="mec-event-image"><img data-src="/uploads/test.jpg" /></div>
      </article>
    `;

    const events = __carinaInternals.extractOverviewEventsFromHtml(
      html,
      "https://www.cafe-carina.at/2020/program/",
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      date: "2026-03-02",
      title: "Monday Music",
      url: "https://www.cafe-carina.at/2020/events/test-event/",
      image: "https://www.cafe-carina.at/uploads/test.jpg",
    });
  });

  it("extracts structured description from detail page", () => {
    const html = `
      <div class="mec-single-event-description mec-events-content">
        <p>Line one.</p>
        <p>Line two.</p>
      </div>
    `;

    const description = __carinaInternals.extractDescriptionFromDetailHtml(html);
    expect(description).toBe("Line one.\n\nLine two.");
  });

  it("discovers rss urls from program html and prioritizes program feed", () => {
    const html = `
      <link rel="alternate" type="application/rss+xml" href="https://www.cafe-carina.at/2020/feed/" />
      <a href="/2020/program/rss-feed/">Programm als rss feed</a>
    `;
    const rssUrls = __carinaInternals.discoverRssUrlsFromProgramHtml(
      html,
      "https://www.cafe-carina.at/2020/program/",
    );
    expect(rssUrls[0]).toBe("https://www.cafe-carina.at/2020/program/rss-feed/");
    expect(rssUrls).toContain("https://www.cafe-carina.at/2020/feed/");
  });

  it("extracts overview entries from rss xml", () => {
    const xml = `<?xml version="1.0"?>
      <rss><channel>
        <item>
          <title><![CDATA[Monday Music]]></title>
          <link>https://www.cafe-carina.at/2020/events/monday-music/</link>
        </item>
      </channel></rss>
    `;

    const events = __carinaInternals.extractOverviewEventsFromRssXml(
      xml,
      "https://www.cafe-carina.at/2020/program/rss-feed/",
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "Monday Music",
      url: "https://www.cafe-carina.at/2020/events/monday-music/",
    });
  });

  it("extracts event links from rss html fallback", () => {
    const html = `
      <ul>
        <li><a href="/2020/events/test-a/">Test A</a></li>
        <li><a href="/2020/events/test-b/">Test B</a></li>
      </ul>
    `;

    const events = __carinaInternals.extractOverviewEventsFromRssHtml(
      html,
      "https://www.cafe-carina.at/2020/program/rss-feed/",
    );

    expect(events).toHaveLength(2);
    expect(events[0].url).toBe("https://www.cafe-carina.at/2020/events/test-a/");
  });

  it("extracts loc urls from sitemap xml", () => {
    const xml = `
      <urlset>
        <url><loc>https://www.cafe-carina.at/2020/events/test-a/</loc></url>
        <url><loc>https://www.cafe-carina.at/2020/events/test-b/</loc></url>
      </urlset>
    `;

    const urls = __carinaInternals.extractLocUrlsFromXml(
      xml,
      "https://www.cafe-carina.at/2020/wp-sitemap-posts-post-1.xml",
    );

    expect(urls).toEqual([
      "https://www.cafe-carina.at/2020/events/test-a/",
      "https://www.cafe-carina.at/2020/events/test-b/",
    ]);
  });
});
