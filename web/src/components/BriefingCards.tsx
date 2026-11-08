"use client";
import { CalendarDays, CloudSun, ListChecks } from "lucide-react";
import type { Briefing, Details } from "./briefing";
import { formatTimeShort } from "./useNow";

function Card({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-5 text-left sm:p-6">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
        <span className="text-[var(--gold)]">{icon}</span>
        {label}
      </h3>
      <div className="space-y-3 text-[clamp(1rem,1.5vw,1.15rem)] leading-snug">{children}</div>
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
    <div className="grid w-full gap-3 md:grid-cols-3 md:gap-4">
      <Card label="Weather" icon={<CloudSun className="size-4" aria-hidden />}>
        {w && typeof w.tempF === "number" ? (
          <div className="flex items-baseline gap-3">
            <span className="tnum font-display text-5xl font-bold">{Math.round(w.tempF)}°</span>
            <span className="text-[var(--muted)]">
              {w.conditions}
              {typeof w.highF === "number" && typeof w.lowF === "number" && (
                <span className="tnum block text-sm">
                  H {Math.round(w.highF)}° · L {Math.round(w.lowF)}°
                  {typeof w.precipChance === "number" && ` · ${Math.round(w.precipChance)}% rain`}
                </span>
              )}
            </span>
          </div>
        ) : null}
        <p className="text-[var(--muted)]">{briefing.weather_summary}</p>
      </Card>

      <Card label="Calendar" icon={<CalendarDays className="size-4" aria-hidden />}>
        {events.length > 0 ? (
          <ul className="space-y-2">
            {events.slice(0, 5).map((e, i) => (
              <li key={i} className="flex gap-3">
                <span className="tnum w-20 shrink-0 text-sm text-[var(--gold)]">{eventTime(e)}</span>
                <span>{e.title}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[var(--muted)]">{briefing.calendar_summary}</p>
        )}
      </Card>

      <Card label="Priorities" icon={<ListChecks className="size-4" aria-hidden />}>
        {tasks.length > 0 ? (
          <ol className="space-y-2">
            {tasks.slice(0, 5).map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className="tnum w-6 shrink-0 text-[var(--gold)]">{i + 1}.</span>
                <span>{t.title}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[var(--muted)]">{briefing.tasks_summary}</p>
        )}
      </Card>
    </div>
  );
}
