import {
  TZ,
  addDaysToKey,
  daysBetween,
  laDateKey,
  parseDateKey,
  toLaIso,
  weekdayOfKey,
  zonedToUtc,
} from "./time";

export type CalEvent = { title: string; start: string; end: string; allDay: boolean; location: string };
export type CalendarResult = { source: "ical" | "demo"; events: CalEvent[] };

/* ------------------------------------------------------------------ */
/* Minimal ICS parser                                                  */
/* Handles: line folding, VEVENT DTSTART/DTEND/SUMMARY/LOCATION,       */
/* VALUE=DATE (all-day), TZID=..., UTC "Z" times, floating times,      */
/* STATUS:CANCELLED, EXDATE, RECURRENCE-ID overrides.                  */
/* RRULE: only the simple cases (DAILY, WEEKLY w/ BYDAY, MONTHLY by    */
/* day-of-month, YEARLY) with INTERVAL/UNTIL/COUNT. Anything fancier   */
/* (BYSETPOS, "2TU" style monthly, BYMONTH lists...) is skipped.       */
/* ------------------------------------------------------------------ */

type IcsDate = {
  dateKey: string; // YYYY-MM-DD wall date (in its own tz, or UTC if Z)
  allDay: boolean;
  h: number;
  mi: number;
  s: number;
  tz: string; // "UTC" or a TZID or TZ (floating)
};

type RawEvent = {
  uid: string;
  summary: string;
  location: string;
  status: string;
  dtstart?: IcsDate;
  dtend?: IcsDate;
  duration?: string;
  rrule?: string;
  exdates: string[]; // LA date keys
  recurrenceId?: IcsDate;
};

type Prop = { name: string; params: Record<string, string>; value: string };

function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function parseLine(line: string): Prop | null {
  // find first ':' not inside double quotes
  let inQ = false;
  let idx = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ":" && !inQ) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return null;
  const head = line.slice(0, idx);
  const value = line.slice(idx + 1);
  const segs = head.split(";");
  const params: Record<string, string> = {};
  for (const seg of segs.slice(1)) {
    const eq = seg.indexOf("=");
    if (eq > 0) params[seg.slice(0, eq).toUpperCase()] = seg.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: segs[0].toUpperCase(), params, value };
}

function unescapeText(v: string): string {
  return v.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

function normalizeTz(tz: string | undefined): string {
  if (!tz) return TZ;
  // Windows-style names Outlook sometimes emits
  const map: Record<string, string> = {
    "Pacific Standard Time": "America/Los_Angeles",
    "Mountain Standard Time": "America/Denver",
    "Central Standard Time": "America/Chicago",
    "Eastern Standard Time": "America/New_York",
  };
  return map[tz] ?? tz;
}

function parseIcsDate(value: string, params: Record<string, string>): IcsDate | undefined {
  const v = value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return undefined;
  const dateKey = `${m[1]}-${m[2]}-${m[3]}`;
  if (!m[4] || params.VALUE === "DATE") {
    return { dateKey, allDay: true, h: 0, mi: 0, s: 0, tz: TZ };
  }
  return {
    dateKey,
    allDay: false,
    h: Number(m[4]),
    mi: Number(m[5]),
    s: Number(m[6] ?? 0),
    tz: m[7] ? "UTC" : normalizeTz(params.TZID),
  };
}

function toInstant(d: IcsDate, onKey?: string): Date {
  const { y, m, d: day } = parseDateKey(onKey ?? d.dateKey);
  if (d.allDay) return zonedToUtc(y, m, day, 0, 0, 0, TZ);
  if (d.tz === "UTC") return new Date(Date.UTC(y, m - 1, day, d.h, d.mi, d.s));
  return zonedToUtc(y, m, day, d.h, d.mi, d.s, d.tz);
}

/** The LA calendar date an IcsDate falls on. */
function laKeyOf(d: IcsDate): string {
  return d.allDay ? d.dateKey : laDateKey(toInstant(d));
}

function parseDuration(dur: string): number {
  // e.g. PT1H30M, P1D
  const m = dur.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const [, sign, w, d, h, mi, s] = m;
  const ms =
    ((Number(w ?? 0) * 7 + Number(d ?? 0)) * 86400 + Number(h ?? 0) * 3600 + Number(mi ?? 0) * 60 + Number(s ?? 0)) *
    1000;
  return sign === "-" ? -ms : ms;
}

export function parseIcs(text: string): RawEvent[] {
  const events: RawEvent[] = [];
  let cur: RawEvent | null = null;
  let depth = 0; // nested components inside VEVENT (VALARM)
  for (const line of unfold(text)) {
    if (!line) continue;
    if (line === "BEGIN:VEVENT") {
      cur = { uid: "", summary: "", location: "", status: "", exdates: [] };
      depth = 0;
      continue;
    }
    if (!cur) continue;
    if (line.startsWith("BEGIN:")) {
      depth++;
      continue;
    }
    if (line === "END:VEVENT") {
      events.push(cur);
      cur = null;
      continue;
    }
    if (line.startsWith("END:")) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth > 0) continue;
    const p = parseLine(line);
    if (!p) continue;
    switch (p.name) {
      case "UID":
        cur.uid = p.value.trim();
        break;
      case "SUMMARY":
        cur.summary = unescapeText(p.value);
        break;
      case "LOCATION":
        cur.location = unescapeText(p.value);
        break;
      case "STATUS":
        cur.status = p.value.trim().toUpperCase();
        break;
      case "DTSTART":
        cur.dtstart = parseIcsDate(p.value, p.params);
        break;
      case "DTEND":
        cur.dtend = parseIcsDate(p.value, p.params);
        break;
      case "DURATION":
        cur.duration = p.value.trim();
        break;
      case "RRULE":
        cur.rrule = p.value.trim();
        break;
      case "RECURRENCE-ID":
        cur.recurrenceId = parseIcsDate(p.value, p.params);
        break;
      case "EXDATE":
        for (const v of p.value.split(",")) {
          const d = parseIcsDate(v, p.params);
          if (d) cur.exdates.push(laKeyOf(d));
        }
        break;
    }
  }
  return events;
}

const BYDAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/** Does a simple RRULE produce an occurrence on `key` (a date in the event's own wall-clock date space)? */
function occursOn(startKey: string, rrule: string, key: string): boolean {
  if (key < startKey) return false;
  const rule: Record<string, string> = {};
  for (const part of rrule.split(";")) {
    const [k, v] = part.split("=");
    if (k && v) rule[k.toUpperCase()] = v;
  }
  if (rule.BYSETPOS || rule.BYWEEKNO || rule.BYYEARDAY || rule.BYHOUR) return false; // not supported
  const interval = Math.max(1, Number(rule.INTERVAL ?? 1));
  if (rule.UNTIL) {
    const u = rule.UNTIL.match(/^(\d{4})(\d{2})(\d{2})/);
    if (u && key > `${u[1]}-${u[2]}-${u[3]}`) return false;
  }

  const matches = (k: string): boolean => {
    const diff = daysBetween(startKey, k);
    if (diff < 0) return false;
    const sp = parseDateKey(startKey);
    const kp = parseDateKey(k);
    switch (rule.FREQ) {
      case "DAILY":
        return diff % interval === 0;
      case "WEEKLY": {
        const days = rule.BYDAY
          ? rule.BYDAY.split(",").map((d) => BYDAY[d.replace(/^[+-]?\d+/, "")]).filter((n) => n !== undefined)
          : [weekdayOfKey(startKey)];
        if (!days.includes(weekdayOfKey(k))) return false;
        // weeks counted from the Sunday of the start week (WKST nuance ignored)
        const startWeek = addDaysToKey(startKey, -weekdayOfKey(startKey));
        const weeks = Math.floor(daysBetween(startWeek, k) / 7);
        return weeks % interval === 0;
      }
      case "MONTHLY": {
        if (rule.BYDAY) return false; // "2TU" style, skipped
        const dom = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(",").map(Number) : [sp.d];
        if (!dom.includes(kp.d)) return false;
        const months = (kp.y - sp.y) * 12 + (kp.m - sp.m);
        return months % interval === 0;
      }
      case "YEARLY": {
        if (rule.BYDAY) return false;
        return kp.m === sp.m && kp.d === sp.d && (kp.y - sp.y) % interval === 0;
      }
      default:
        return false;
    }
  };

  if (!matches(key)) return false;
  if (rule.COUNT) {
    const count = Number(rule.COUNT);
    const span = daysBetween(startKey, key);
    if (span > 800) return false; // keep it cheap; very old COUNT rules have long since ended anyway
    let n = 0;
    for (let i = 0; i <= span; i++) if (matches(addDaysToKey(startKey, i))) n++;
    if (n > count) return false;
  }
  return true;
}

export function eventsForDay(raw: RawEvent[], dayKey: string): CalEvent[] {
  const dayStart = zonedToUtc(...ymd(dayKey), 0, 0, 0, TZ).getTime();
  const dayEnd = zonedToUtc(...ymd(addDaysToKey(dayKey, 1)), 0, 0, 0, TZ).getTime();

  // RECURRENCE-ID overrides: UID + original LA date key
  const overridden = new Set<string>();
  for (const e of raw) if (e.recurrenceId) overridden.add(`${e.uid}|${laKeyOf(e.recurrenceId)}`);

  const out: CalEvent[] = [];
  for (const e of raw) {
    if (!e.dtstart || e.status === "CANCELLED") continue;
    const s = e.dtstart;
    const baseStart = toInstant(s);
    let durMs: number;
    if (e.dtend) durMs = toInstant(e.dtend).getTime() - baseStart.getTime();
    else if (e.duration) durMs = parseDuration(e.duration);
    else durMs = s.allDay ? 86400000 : 0;
    if (durMs < 0) durMs = 0;

    const candidates: Date[] = [];
    if (e.rrule && !e.recurrenceId) {
      // Check yesterday/today/tomorrow in the event's wall-date space (covers tz shifts + overnight events)
      for (const off of [-1, 0, 1]) {
        const k = addDaysToKey(dayKey, off);
        if (!occursOn(s.dateKey, e.rrule, k)) continue;
        const inst = toInstant(s, k);
        const laKey = s.allDay ? k : laDateKey(inst);
        if (e.exdates.includes(laKey) || overridden.has(`${e.uid}|${laKey}`)) continue;
        candidates.push(inst);
      }
    } else {
      candidates.push(baseStart);
    }

    for (const start of candidates) {
      const startMs = start.getTime();
      const endMs = startMs + durMs;
      const overlaps = durMs === 0 ? startMs >= dayStart && startMs < dayEnd : startMs < dayEnd && endMs > dayStart;
      if (!overlaps) continue;
      out.push({
        title: e.summary || "Busy",
        start: toLaIso(start),
        end: toLaIso(new Date(endMs)),
        allDay: s.allDay,
        location: e.location,
      });
    }
  }

  // dedupe (same title + start), then sort: all-day first, then by start
  const seen = new Set<string>();
  return out
    .filter((ev) => {
      const k = `${ev.title}|${ev.start}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (a.allDay === b.allDay ? Date.parse(a.start) - Date.parse(b.start) : a.allDay ? -1 : 1));
}

function ymd(key: string): [number, number, number] {
  const { y, m, d } = parseDateKey(key);
  return [y, m, d];
}

/* ------------------------------------------------------------------ */

function demoDay(dayKey: string): CalEvent[] {
  const at = (h: number, mi: number) => zonedToUtc(...ymd(dayKey), h, mi, 0, TZ);
  const ev = (title: string, sh: number, sm: number, eh: number, em: number, location: string): CalEvent => ({
    title,
    start: toLaIso(at(sh, sm)),
    end: toLaIso(at(eh, em)),
    allDay: false,
    location,
  });
  return [
    ev("Marketing 370 lecture", 10, 0, 11, 15, "Adams Humanities 2108"),
    ev("SDx meeting", 13, 0, 14, 0, "Conrad Prebys Aztec Student Union"),
    ev("Market research paper due", 17, 0, 17, 0, "Canvas"),
    ev("Gym", 19, 0, 20, 0, "ARC"),
  ];
}

export async function getCalendar(): Promise<CalendarResult> {
  const today = laDateKey();
  const url = (process.env.ICAL_URL ?? "").trim();
  if (!url) return { source: "demo", events: demoDay(today) };
  try {
    const res = await fetch(url.replace(/^webcal:\/\//i, "https://"), {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`ical ${res.status}`);
    const text = await res.text();
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("not an ICS feed");
    return { source: "ical", events: eventsForDay(parseIcs(text), today) };
  } catch (err) {
    console.error("[calendar] falling back to demo:", err);
    return { source: "demo", events: demoDay(today) };
  }
}
