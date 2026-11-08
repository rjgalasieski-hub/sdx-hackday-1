"use client";
// Client tools the ElevenLabs agent calls mid-conversation (registered on the agent as
// build_plan and lock_plan). The planner itself runs server-side in a Daytona sandbox.
import { CalendarClock, CalendarPlus, Loader2, Lock } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getGoogleEvents } from "./googleCalendar";
import { haptic } from "./haptics";

export type Block = { title: string; start: string; end: string; kind: "routine" | "event" | "deadline" | "task" };
export type PlanState = { blocks: Block[]; unscheduled: string[]; source: string; ms: number; locked: boolean; note?: string };
type Adjustment = { title: string; start?: string; minutes?: number; remove?: boolean };

export const PROFILE_KEY = "wake.profile";
export function savedProfile(): unknown {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function warmPlanner() {
  void getGoogleEvents()
    .then((calendarEvents) =>
      fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: savedProfile(), calendarEvents }),
      }),
    )
    .catch(() => {});
}

export function usePlanTools() {
  const [plan, setPlan] = useState<PlanState | null>(null);
  const [planning, setPlanning] = useState(false);
  const planRef = useRef<PlanState | null>(null);

  const reset = useCallback(() => {
    planRef.current = null;
    setPlan(null);
  }, []);

  const clientTools = useMemo(
    () => ({
      build_plan: async (params: { adjustments?: Adjustment[] }) => {
        setPlanning(true);
        try {
          const res = await fetch("/api/plan", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              adjustments: Array.isArray(params?.adjustments) ? params.adjustments : [],
              profile: savedProfile(),
              calendarEvents: await getGoogleEvents(),
            }),
          });
          const data = await res.json();
          const next: PlanState = { blocks: data.blocks, unscheduled: data.unscheduled, source: data.source, ms: data.ms, locked: false };
          planRef.current = next;
          setPlan(next);
          return data.spoken as string;
        } catch {
          return "The planner didn't respond. Tell the user you'll keep it simple and suggest their most important task first.";
        } finally {
          setPlanning(false);
        }
      },
      lock_plan: async (params: { note?: string }) => {
        const current = planRef.current;
        if (!current) return "There's no plan yet. Call build_plan first.";
        const res = await fetch("/api/plan/lock", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ blocks: current.blocks }),
        });
        if (!res.ok) return "Saving failed. Tell the user the plan is on screen anyway.";
        const next = { ...current, locked: true, note: params?.note };
        planRef.current = next;
        setPlan(next);
        return "Locked. The plan is on their screen with Add to Google Calendar buttons.";
      },
    }),
    [],
  );

  return { plan, planning, clientTools, reset };
}

const pad = (n: number) => String(n).padStart(2, "0");
function gcalLink(b: Block): string {
  const d = new Date();
  const day = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const t = (hhmm: string) => `${day}T${hhmm.replace(":", "")}00`;
  const end = b.end === b.start ? `${pad(Number(b.start.slice(0, 2)) + 0)}${b.start.slice(3)}` : b.end;
  const params = new URLSearchParams({ action: "TEMPLATE", text: b.title, dates: `${t(b.start)}/${t(end)}`, ctz: "America/Los_Angeles", details: "Planned with Wake" });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
function clock(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
}

const KIND_LABEL: Record<Block["kind"], string> = { routine: "Routine", event: "Event", deadline: "Due", task: "Task" };

export function PlanCard({ plan, planning }: { plan: PlanState | null; planning: boolean }) {
  const locked = !!plan?.locked;
  // One tap the moment the card turns locked (not on a card that mounts already locked, e.g. the Done screen).
  const wasLocked = useRef(locked);
  useEffect(() => {
    if (locked && !wasLocked.current) haptic();
    wasLocked.current = locked;
  }, [locked]);
  if (!plan && !planning) return null;
  return (
    <section
      className={`card w-full max-w-2xl overflow-hidden ${locked ? "card-selected" : ""}`}
      style={locked ? { boxShadow: "var(--glow)" } : undefined}
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
        <div className="flex items-center gap-2.5">
          {locked ? <Lock className="size-5 text-[var(--gold)]" aria-hidden /> : <CalendarClock className="size-5 text-[var(--gold)]" aria-hidden />}
          <h3 className="font-display text-xl font-bold">{locked ? "Today's plan, locked" : "Today's plan"}</h3>
        </div>
        <span className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
          {planning && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {planning ? "Planning in Daytona" : plan ? `${plan.source === "daytona" ? "Daytona" : "Local"} · ${plan.ms} ms` : ""}
        </span>
      </div>
      {plan?.note && <p className="border-b border-[var(--line)] px-5 py-3 text-[var(--muted)]">{plan.note}</p>}
      {planning && !plan && (
        <ul className="fade-in-fast flex flex-col gap-3 p-5" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center gap-4">
              <span className="h-4 w-16 animate-pulse rounded bg-white/10" />
              <span className="h-4 flex-1 animate-pulse rounded bg-white/10" style={{ maxWidth: `${70 - i * 12}%` }} />
            </li>
          ))}
        </ul>
      )}
      <ol className="flex flex-col divide-y divide-[var(--line)]">
        {plan?.blocks.map((b, i) => (
          <li key={`${b.title}-${i}`} className="fade-in-fast flex items-center gap-3 px-5 py-3 sm:gap-4">
            <span className="tnum w-[4.75rem] shrink-0 text-sm text-[var(--gold)] sm:text-base">{clock(b.start)}</span>
            <span className="min-w-0 flex-1">
              <span className={`block leading-snug ${b.kind === "deadline" ? "font-semibold text-[var(--gold)]" : ""}`}>
                {b.kind === "deadline" ? `Due: ${b.title}` : b.title}
              </span>
              <span className="tnum block text-xs text-[var(--faint)]">
                {KIND_LABEL[b.kind]}
                {b.end !== b.start ? ` · until ${clock(b.end)}` : ""}
              </span>
            </span>
            {plan.locked && b.kind !== "routine" && (
              <a
                href={gcalLink(b)}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost shrink-0 gap-1.5 px-3 py-2 text-xs sm:text-sm"
                aria-label={`Add ${b.title} to Google Calendar`}
              >
                <CalendarPlus className="size-4" aria-hidden />
                <span className="hidden sm:inline">Add to Google Calendar</span>
                <span className="sm:hidden">Add</span>
              </a>
            )}
          </li>
        ))}
      </ol>
      {!!plan?.unscheduled.length && (
        <p className="border-t border-[var(--line)] px-5 py-3 text-sm text-[var(--muted)]">Didn&apos;t fit today: {plan.unscheduled.join(", ")}</p>
      )}
    </section>
  );
}
