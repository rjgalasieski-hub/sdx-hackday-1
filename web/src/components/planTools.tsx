"use client";
// Client tools the ElevenLabs agent calls mid-conversation (registered on the agent as
// build_plan and lock_plan). The planner itself runs server-side in a Daytona sandbox.
import { useCallback, useMemo, useRef, useState } from "react";

export type Block = { title: string; start: string; end: string; kind: "routine" | "event" | "deadline" | "task" };
export type PlanState = { blocks: Block[]; unscheduled: string[]; source: string; ms: number; locked: boolean; note?: string };
type Adjustment = { title: string; start?: string; minutes?: number; remove?: boolean };

export function warmPlanner() {
  void fetch("/api/plan", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => {});
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
            body: JSON.stringify({ adjustments: Array.isArray(params?.adjustments) ? params.adjustments : [] }),
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

export function PlanCard({ plan, planning }: { plan: PlanState | null; planning: boolean }) {
  if (!plan && !planning) return null;
  return (
    <section className="w-full max-w-2xl rounded-2xl border border-white/10 bg-white/[0.04] p-5" aria-live="polite">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{plan?.locked ? "Today's plan, locked" : "Today's plan"}</h3>
        <span className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
          {planning ? "Planning in Daytona…" : plan ? `${plan.source === "daytona" ? "Planned in Daytona" : "Planned locally"} · ${plan.ms} ms` : ""}
        </span>
      </div>
      {plan?.note && <p className="mb-3 text-[var(--soft)]">{plan.note}</p>}
      <ol className="flex flex-col gap-2">
        {plan?.blocks.map((b, i) => (
          <li key={`${b.title}-${i}`} className="flex items-center gap-3">
            <span className="w-20 shrink-0 font-mono text-sm tabular-nums text-amber-400">{clock(b.start)}</span>
            <span className={`min-w-0 flex-1 ${b.kind === "deadline" ? "text-amber-300" : ""}`}>
              {b.kind === "deadline" ? `Due: ${b.title}` : b.title}
            </span>
            {plan.locked && b.kind !== "routine" && (
              <a href={gcalLink(b)} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-white/15 px-2.5 py-1 text-xs hover:bg-white/10">
                Add to Google Calendar
              </a>
            )}
          </li>
        ))}
      </ol>
      {!!plan?.unscheduled.length && <p className="mt-3 text-sm text-[var(--muted)]">Didn&apos;t fit today: {plan.unscheduled.join(", ")}</p>}
    </section>
  );
}
