import { describe, expect, it } from "vitest";
import type { Event } from "@/types/event";
import { compareEventsChronologically, filterFutureEvents, groupEventsByDate } from "./events";

const baseEvents: Event[] = [
  {
    location: "Chelsea Wien",
    title: "B",
    description: "",
    date: "2026-03-01",
    time: "21:00",
    event_url: "https://example.com/b",
  },
  {
    location: "Chelsea Wien",
    title: "A",
    description: "",
    date: "2026-03-01",
    time: "20:00",
    event_url: "https://example.com/a",
  },
  {
    location: "Chelsea Wien",
    title: "C",
    description: "",
    date: "2026-03-02",
    time: "TBA",
    event_url: "https://example.com/c",
  },
];

describe("events", () => {
  it("sorts events by date then time", () => {
    const sorted = [...baseEvents].sort(compareEventsChronologically);

    expect(sorted.map((event) => event.title)).toEqual(["A", "B", "C"]);
  });

  it("filters out past events with Vienna timezone", () => {
    const now = new Date("2026-03-01T10:00:00Z");
    const filtered = filterFutureEvents(
      [
        ...baseEvents,
        {
          location: "Chelsea Wien",
          title: "PAST",
          description: "",
          date: "2026-02-28",
          time: "20:00",
          event_url: "https://example.com/past",
        },
      ],
      "Europe/Vienna",
      now,
    );

    expect(filtered.some((event) => event.title === "PAST")).toBe(false);
  });

  it("keeps previous-day events shortly after midnight in Vienna", () => {
    const now = new Date("2026-02-28T23:30:00Z");
    const filtered = filterFutureEvents(
      [
        ...baseEvents,
        {
          location: "Chelsea Wien",
          title: "YESTERDAY",
          description: "",
          date: "2026-02-28",
          time: "23:00",
          event_url: "https://example.com/yesterday",
        },
      ],
      "Europe/Vienna",
      now,
    );

    expect(filtered.some((event) => event.title === "YESTERDAY")).toBe(true);
  });

  it("hides previous-day events once morning grace period is over", () => {
    const now = new Date("2026-03-01T07:00:00Z");
    const filtered = filterFutureEvents(
      [
        ...baseEvents,
        {
          location: "Chelsea Wien",
          title: "YESTERDAY",
          description: "",
          date: "2026-02-28",
          time: "23:00",
          event_url: "https://example.com/yesterday",
        },
      ],
      "Europe/Vienna",
      now,
    );

    expect(filtered.some((event) => event.title === "YESTERDAY")).toBe(false);
  });

  it("groups events by day", () => {
    const grouped = groupEventsByDate(baseEvents);

    expect(grouped.get("2026-03-01")?.length).toBe(2);
    expect(grouped.get("2026-03-02")?.length).toBe(1);
  });
});
