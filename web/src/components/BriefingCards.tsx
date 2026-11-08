"use client";
import type { Briefing, Details } from "./briefing";
import { formatTimeShort } from "./useNow";

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-5 text-left backdrop-blur sm:p-6">
      <h3 className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </h3>
      <div className="space-y-3 text-[clamp(1rem,1.6vw,1.25rem)] leading-snug">{children}</div>
    </section>
  );
}

function eventTime(e: { start?: string; allDay?: boolean }) {
  if (e.allDay) return "All day";
  if (!e.start) return "";
  const d = new Date(e.start);
  return Number.isNaN(d.getTime()) ? "" : formatTimeShort(d);
}

export function BriefingCards({ briefing, details }: { briefing: Briefing; details: Details }) {
  const w = details.weather;
  const events = details.events ?? [];
  const tasks = details.tasks ?? [];

  return (
    <div className="grid w-full gap-4 md:grid-cols-3">
      <Card label="Weather">
        {w && typeof w.tempF === "number" ? (
          <div className="flex items-baseline gap-3">
            <span className="text-5xl font-extralight tabular-nums">{Math.round(w.tempF)}°</span>
            <span className="text-[var(--muted)]">
              {w.conditions}
              {typeof w.highF === "number" && typeof w.lowF === "number" && (
                <span className="block text-base">
                  H {Math.round(w.highF)}° · L {Math.round(w.lowF)}°
                  {typeof w.precipChance === "number" && ` · ${Math.round(w.precipChance)}% rain`}
                </span>
              )}
            </span>
          </div>
        ) : null}
        <p className="text-[var(--soft)]">{briefing.weather_summary}</p>
      </Card>

      <Card label="Calendar">
        {events.length > 0 ? (
          <ul className="space-y-2">
            {events.slice(0, 5).map((e, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-20 shrink-0 tabular-nums text-[var(--dawn)]">{eventTime(e)}</span>
                <span>{e.title}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[var(--soft)]">{briefing.calendar_summary}</p>
        )}
      </Card>

      <Card label="Priorities">
        {tasks.length > 0 ? (
          <ol className="space-y-2">
            {tasks.slice(0, 5).map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-6 shrink-0 tabular-nums text-[var(--dawn)]">{i + 1}.</span>
                <span>{t.title}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[var(--soft)]">{briefing.tasks_summary}</p>
        )}
      </Card>
    </div>
  );
}
