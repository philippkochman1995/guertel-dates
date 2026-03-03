import { describe, expect, it } from "vitest";
import { formatDateLabel, getTodayISOInTimeZone, VIENNA_TIME_ZONE } from "./dates";

describe("dates", () => {
  it("returns TODAY and TOMORROW labels in Vienna timezone", () => {
    const now = new Date("2026-03-01T10:00:00Z");

    expect(formatDateLabel("2026-03-01", { now, timeZone: VIENNA_TIME_ZONE })).toBe("TODAY");
    expect(formatDateLabel("2026-03-02", { now, timeZone: VIENNA_TIME_ZONE })).toBe("TOMORROW");
  });

  it("formats non-relative dates as uppercase labels", () => {
    const now = new Date("2026-03-01T10:00:00Z");

    expect(formatDateLabel("2026-03-04", { now, timeZone: VIENNA_TIME_ZONE })).toBe(
      "WEDNESDAY, 4 MARCH 2026",
    );
  });

  it("computes today based on timezone boundary", () => {
    const nearMidnightUtc = new Date("2026-03-01T23:30:00Z");

    expect(getTodayISOInTimeZone(VIENNA_TIME_ZONE, nearMidnightUtc)).toBe("2026-03-02");
  });
});
