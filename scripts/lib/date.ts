export const VIENNA_TIME_ZONE = "Europe/Vienna";

function toIsoDateInTimeZone(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

function toIsoDateFromParts(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  return toIsoDateInTimeZone(date, "UTC");
}

export function getTodayISOInTimeZone(timeZone = VIENNA_TIME_ZONE, now = new Date()): string {
  return toIsoDateInTimeZone(now, timeZone);
}

export function addDaysToIsoDateInUtc(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDateInTimeZone(date, "UTC");
}

export function getHourInTimeZone(timeZone = VIENNA_TIME_ZONE, now = new Date()): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(now);
  const hourValue = parts.find((part) => part.type === "hour")?.value ?? "0";
  const hour = Number(hourValue);
  return Number.isNaN(hour) ? 0 : hour;
}

export function parseEuropeanDateToIso(
  value: string,
  options?: {
    now?: Date;
    timeZone?: string;
  },
): string | null {
  const match = value.match(/(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?/);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const yearMatch = match[3];

  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return null;
  }

  const now = options?.now ?? new Date();
  const timeZone = options?.timeZone ?? VIENNA_TIME_ZONE;
  const todayIso = getTodayISOInTimeZone(timeZone, now);

  const currentYear = Number(todayIso.slice(0, 4));
  const explicitYear = yearMatch
    ? yearMatch.length === 2
      ? 2000 + Number(yearMatch)
      : Number(yearMatch)
    : null;

  if (explicitYear) {
    return toIsoDateFromParts(explicitYear, month, day);
  }

  const thisYearIso = toIsoDateFromParts(currentYear, month, day);
  if (thisYearIso >= todayIso) {
    return thisYearIso;
  }

  return toIsoDateFromParts(currentYear + 1, month, day);
}
