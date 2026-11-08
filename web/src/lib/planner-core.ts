// Self-contained day planner. No imports and no top-level helpers on purpose: /api/plan ships the
// compiled planDay function itself into a Daytona sandbox and runs it there (the local copy is the
// fallback), so everything it needs lives inside the function. Times are "HH:MM", 24h.
export type PlanEvent = { title: string; start: string; end: string };
export type PlanTask = { title: string; priority: "high" | "medium" | "low"; minutes?: number };
export type Adjustment = { title: string; start?: string; minutes?: number; remove?: boolean };
export type PlanInput = {
  wake: string;
  now?: string; // current local time; nothing gets planned before it
  dayEnd: string;
  events: PlanEvent[];
  tasks: PlanTask[];
  adjustments: Adjustment[];
};
export type Block = { title: string; start: string; end: string; kind: "routine" | "event" | "deadline" | "task" };
export type PlanResult = { blocks: Block[]; unscheduled: string[]; conflicts: string[] };

export function planDay(input: PlanInput): PlanResult {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const toHHMM = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  const STOP = new Set(["the", "my", "a", "an", "to", "at", "for", "of", "and", "with", "session", "la", "el", "mi", "de"]);
  const tokens = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N} ]/gu, " ")
      .split(/\s+/)
      .filter((w) => w && !STOP.has(w));
  // Best single match by shared words, so "the meeting" finds "Team meeting" and "gym" doesn't also hit "Gym class prep".
  const score = (a: string, b: string) => {
    const x = tokens(a), y = new Set(tokens(b));
    if (!x.length || !y.size) return 0;
    const shared = x.filter((w) => y.has(w)).length;
    return shared / Math.max(x.length, y.size);
  };
  const titles = [...input.events.map((e) => e.title), ...input.tasks.map((t) => t.title)];
  const bestTitle = (name: string) => {
    let best = "", top = 0;
    for (const t of titles) {
      const s = score(name, t);
      if (s > top) { top = s; best = t; }
    }
    return top > 0 ? best : "";
  };
  // Merge every adjustment per target in order, so a later change wins over an earlier one.
  const merged = new Map<string, Adjustment>();
  const extras: Adjustment[] = [];
  for (const a of input.adjustments) {
    const target = bestTitle(a.title);
    if (!target) { extras.push(a); continue; }
    const prev = merged.get(target) ?? { title: target };
    merged.set(target, a.remove ? { title: target, remove: true } : { ...prev, ...a, title: target, remove: false });
  }
  const DEFAULT_MIN = { high: 90, medium: 60, low: 30 } as const;
  const RANK = { high: 0, medium: 1, low: 2 } as const;

  const wake = toMin(input.wake);
  const nowMin = input.now ? toMin(input.now) : 0;
  const dayEnd = toMin(input.dayEnd);
  // Plan from whichever is later: 30 min after waking, or right now (rounded up to 5 min).
  const startAt = Math.max(wake + 30, Math.ceil(nowMin / 5) * 5);
  type Placed = { title: string; s: number; e: number; kind: Block["kind"] };
  const fixed: Placed[] = [];
  if (wake + 30 > nowMin) fixed.push({ title: "Get up, get ready, breakfast", s: wake, e: wake + 30, kind: "routine" });
  const deadlines: Block[] = [];

  for (const ev of input.events) {
    const adj = merged.get(ev.title);
    if (adj?.remove) continue;
    let s = toMin(ev.start), e = toMin(ev.end);
    if (e <= s) {
      deadlines.push({ title: ev.title, start: ev.start, end: ev.start, kind: "deadline" });
      continue;
    }
    if (adj?.start) { const len = adj.minutes ?? e - s; s = toMin(adj.start); e = s + len; }
    else if (adj?.minutes) e = s + adj.minutes;
    if (e <= nowMin) continue; // already over
    fixed.push({ title: ev.title, s, e, kind: "event" });
  }

  const flexible: PlanTask[] = [];
  const seen = new Set<string>();
  for (const t of input.tasks) {
    const key = tokens(t.title).join(" ");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const adj = merged.get(t.title);
    if (adj?.remove) continue;
    const len = adj?.minutes ?? t.minutes ?? DEFAULT_MIN[t.priority];
    if (adj?.start) fixed.push({ title: t.title, s: toMin(adj.start), e: toMin(adj.start) + len, kind: "task" });
    else flexible.push({ ...t, minutes: len });
  }
  // Adjustments that name something new ("add a nap at 2"): fixed if timed, otherwise a flexible task.
  for (const a of extras) {
    if (a.remove) continue;
    if (a.start) fixed.push({ title: a.title, s: toMin(a.start), e: toMin(a.start) + (a.minutes ?? 60), kind: "task" });
    else flexible.push({ title: a.title, priority: "medium", minutes: a.minutes ?? 30 });
  }
  flexible.sort((a, b) => RANK[a.priority] - RANK[b.priority]);

  const conflicts: string[] = [];
  const sortedFixed = fixed.slice().sort((a, b) => a.s - b.s);
  for (let i = 1; i < sortedFixed.length; i++) {
    const p = sortedFixed[i - 1], c = sortedFixed[i];
    if (c.s < p.e && p.kind !== "routine") conflicts.push(`${c.title} overlaps ${p.title}`);
  }

  const placed: Placed[] = [...fixed];
  const unscheduled: string[] = [];
  for (const t of flexible) {
    const len = t.minutes!;
    const busy = placed.slice().sort((a, b) => a.s - b.s);
    let cursor = startAt, slot = -1;
    for (const b of busy) {
      if (b.e <= cursor) continue;
      if (b.s - cursor >= len) { slot = cursor; break; }
      cursor = Math.max(cursor, b.e + 10);
    }
    if (slot < 0 && dayEnd - cursor >= len) slot = cursor;
    if (slot < 0) { unscheduled.push(t.title); continue; }
    placed.push({ title: t.title, s: slot, e: slot + len, kind: "task" });
  }

  const blocks: Block[] = placed
    .map((b) => ({ title: b.title, start: toHHMM(b.s), end: toHHMM(b.e), kind: b.kind }))
    .concat(deadlines.filter((d) => toMin(d.start) >= nowMin))
    .sort((a, b) => toMin(a.start) - toMin(b.start));
  return { blocks, unscheduled, conflicts };
}
