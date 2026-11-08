// Timezone helpers. Everything user-facing is America/Los_Angeles.
export const TZ = "America/Los_Angeles";

type Parts = { y: number; m: number; d: number; h: number; mi: number; s: number };

function partsIn(date: Date, tz: string): Parts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    h: Number(p.hour) % 24,
    mi: Number(p.minute),
    s: Number(p.second),
  };
}

export function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset (ms) of tz from UTC at the given instant. LA in winter = -8h. */
export function tzOffsetMs(date: Date, tz: string): number {
  const p = partsIn(date, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Wall-clock time in tz -> real instant. */
export function zonedToUtc(y: number, m: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const zone = isValidTz(tz) ? tz : TZ;
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  let ts = guess - tzOffsetMs(new Date(guess), zone);
  // second pass handles DST boundaries
  ts = guess - tzOffsetMs(new Date(ts), zone);
  return new Date(ts);
}

/** "YYYY-MM-DD" for the instant, in LA. */
export function laDateKey(date: Date = new Date()): string {
  const p = partsIn(date, TZ);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function parseDateKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

export function addDaysToKey(key: string, days: number): string {
  const { y, m, d } = parseDateKey(key);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Whole days between two date keys (b - a). */
export function daysBetween(a: string, b: string): number {
  const pa = parseDateKey(a);
  const pb = parseDateKey(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

/** 0 = Sunday */
export function weekdayOfKey(key: string): number {
  const { y, m, d } = parseDateKey(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** ISO string with LA offset, e.g. 2026-11-08T10:00:00-08:00 */
export function toLaIso(date: Date): string {
  const p = partsIn(date, TZ);
  const off = Math.round(tzOffsetMs(date, TZ) / 60000);
  const sign = off <= 0 ? "-" : "+";
  const abs = Math.abs(off);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** "10 AM", "1:30 PM", "noon", "midnight" in LA. */
export function spokenTime(date: Date): string {
  const p = partsIn(date, TZ);
  if (p.h === 12 && p.mi === 0) return "noon";
  if (p.h === 0 && p.mi === 0) return "midnight";
  const suffix = p.h >= 12 ? "PM" : "AM";
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return p.mi === 0 ? `${h12} ${suffix}` : `${h12}:${String(p.mi).padStart(2, "0")} ${suffix}`;
}

/** "Sunday, November 8" in LA. */
export function spokenDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "today", "tomorrow", "Wednesday", "next Monday", "November 20" relative to today in LA. */
export function spokenDue(dueKey: string, todayKey: string = laDateKey()): string {
  const diff = daysBetween(todayKey, dueKey);
  if (diff < 0) return diff === -1 ? "yesterday, so it's overdue" : "already overdue";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff < 7) return WEEKDAYS[weekdayOfKey(dueKey)];
  if (diff < 14) return `next ${WEEKDAYS[weekdayOfKey(dueKey)]}`;
  const { y, m, d } = parseDateKey(dueKey);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
}

/** Make text safe to read aloud: no markdown symbols, no em/en dashes. */
export function speakable(text: string): string {
  return text
    .replace(/[—–]/g, ", ")
    .replace(/[*_#`~>|]/g, "")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}
