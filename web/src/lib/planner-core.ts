// Self-contained day planner. No imports on purpose: /api/plan sends this exact file into a
// Daytona sandbox and runs it there (local copy is the fallback). Times are "HH:MM", 24h.
export type PlanEvent = { title: string; start: string; end: string };
export type PlanTask = { title: string; priority: "high" | "medium" | "low"; minutes?: number };
export type Adjustment = { title: string; start?: string; minutes?: number; remove?: boolean };
export type PlanInput = { wake: string; dayEnd: string; events: PlanEvent[]; tasks: PlanTask[]; adjustments: Adjustment[] };
export type Block = { title: string; start: string; end: string; kind: "routine" | "event" | "deadline" | "task" };
export type PlanResult = { blocks: Block[]; unscheduled: string[] };

export function planDay(input: PlanInput): PlanResult {
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
  const toHHMM = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const matches = (a: string, b: string) => { const x = norm(a), y = norm(b); return !!x && !!y && (x.includes(y) || y.includes(x)); };
  const findAdj = (title: string) => input.adjustments.find((a) => matches(title, a.title));
  const DEFAULT_MIN = { high: 90, medium: 60, low: 30 } as const;
  const RANK = { high: 0, medium: 1, low: 2 } as const;

  const wake = toMin(input.wake);
  const dayEnd = toMin(input.dayEnd);
  const fixed: { title: string; s: number; e: number; kind: Block["kind"] }[] = [
    { title: "Get up, get ready, breakfast", s: wake, e: wake + 30, kind: "routine" },
  ];
  const deadlines: Block[] = [];

  for (const ev of input.events) {
    const adj = findAdj(ev.title);
    if (adj?.remove) continue;
    let s = toMin(ev.start), e = toMin(ev.end);
    if (e <= s) { deadlines.push({ title: ev.title, start: ev.start, end: ev.start, kind: "deadline" }); continue; }
    if (adj?.start) { const len = adj.minutes ?? e - s; s = toMin(adj.start); e = s + len; }
    else if (adj?.minutes) e = s + adj.minutes;
    fixed.push({ title: ev.title, s, e, kind: "event" });
  }

  const tasks = input.tasks
    .filter((t) => !findAdj(t.title)?.remove)
    .sort((a, b) => RANK[a.priority] - RANK[b.priority]);
  const flexible: PlanTask[] = [];
  for (const t of tasks) {
    const adj = findAdj(t.title);
    const len = adj?.minutes ?? t.minutes ?? DEFAULT_MIN[t.priority];
    if (adj?.start) fixed.push({ title: t.title, s: toMin(adj.start), e: toMin(adj.start) + len, kind: "task" });
    else flexible.push({ ...t, minutes: len });
  }
  // Adjustments that name something new ("add a nap at 2") become fixed blocks too.
  for (const a of input.adjustments) {
    if (a.remove || !a.start) continue;
    const known = input.events.some((e) => matches(e.title, a.title)) || input.tasks.some((t) => matches(t.title, a.title));
    if (!known) fixed.push({ title: a.title, s: toMin(a.start), e: toMin(a.start) + (a.minutes ?? 60), kind: "task" });
  }

  const placed: { title: string; s: number; e: number; kind: Block["kind"] }[] = [...fixed];
  const unscheduled: string[] = [];
  for (const t of flexible) {
    const len = t.minutes!;
    const busy = placed.slice().sort((a, b) => a.s - b.s);
    let cursor = wake + 30, slot = -1;
    for (const b of busy) {
      if (b.s - cursor >= len) { slot = cursor; break; }
      cursor = Math.max(cursor, b.e + 10);
    }
    if (slot < 0 && dayEnd - cursor >= len) slot = cursor;
    if (slot < 0) { unscheduled.push(t.title); continue; }
    placed.push({ title: t.title, s: slot, e: slot + len, kind: "task" });
  }

  const blocks: Block[] = placed
    .map((b) => ({ title: b.title, start: toHHMM(b.s), end: toHHMM(b.e), kind: b.kind }))
    .concat(deadlines)
    .sort((a, b) => toMin(a.start) - toMin(b.start));
  return { blocks, unscheduled };
}
