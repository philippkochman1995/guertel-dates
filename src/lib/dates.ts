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

function addDaysToIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDateInTimeZone(date, "UTC");
}

function toUppercaseDateLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const parts = formatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";

  const weekday = part("weekday");
  const day = part("day");
  const month = part("month");
  const year = part("year");

  return `${weekday}, ${day} ${month} ${year}`.toUpperCase();
}

export function getTodayISOInTimeZone(timeZone = VIENNA_TIME_ZONE, now = new Date()): string {
  return toIsoDateInTimeZone(now, timeZone);
}

export function addDaysToIsoDateInUtc(isoDate: string, days: number): string {
  return addDaysToIsoDate(isoDate, days);
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

export function formatDateLabel(
  dateStr: string,
  options?: {
    timeZone?: string;
    now?: Date;
  },
): string {
  const timeZone = options?.timeZone ?? VIENNA_TIME_ZONE;
  const todayIso = getTodayISOInTimeZone(timeZone, options?.now ?? new Date());
  const tomorrowIso = addDaysToIsoDate(todayIso, 1);

  if (dateStr === todayIso) {
    return "TODAY";
  }

  if (dateStr === tomorrowIso) {
    return "TOMORROW";
  }

  return toUppercaseDateLabel(dateStr);
}
