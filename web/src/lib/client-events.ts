import type { CalEvent } from "./calendar";

// Events the browser read from Google Calendar (googleCalendar.ts). Validate, sort, cap.
export function clientEvents(input: unknown): CalEvent[] | null {
  if (!Array.isArray(input)) return null;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  return input
    .slice(0, 25)
    .map((e) => ({
      title: str(e?.title, 120) || "Busy",
      start: str(e?.start, 40),
      end: str(e?.end, 40),
      allDay: Boolean(e?.allDay),
      location: str(e?.location, 120) || undefined,
    }))
    .filter((e) => !Number.isNaN(Date.parse(e.start)) && !Number.isNaN(Date.parse(e.end)))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start)) as CalEvent[];
}
