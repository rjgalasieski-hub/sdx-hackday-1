import { promises as fs } from "fs";
import path from "path";
import { Daytona, type Sandbox } from "@daytonaio/sdk";
import { getCalendar, type CalEvent } from "./calendar";
import { getProfile, type Profile } from "./profile";
import { getTasks } from "./tasks";
import { planDay, type Adjustment, type Block, type PlanInput, type PlanResult, type PlanTask } from "./planner-core";

const LA = "America/Los_Angeles";
const hhmm = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: LA, hour: "2-digit", minute: "2-digit", hour12: false });
const laDay = (d: string | Date) => new Date(d).toLocaleDateString("en-CA", { timeZone: LA });

export async function buildPlanInput(
  adjustments: Adjustment[],
  clientProfile?: Partial<Profile> | null,
  googleEvents?: CalEvent[] | null,
  agentTasks: PlanTask[] = [],
): Promise<PlanInput> {
  const profile = await getProfile(clientProfile);
  const calendar = googleEvents
    ? { events: googleEvents }
    : profile.icalUrl || profile.demoCalendar
      ? await getCalendar(profile.icalUrl)
      : { events: [] as CalEvent[] };
  const fileTasks = getTasks().tasks.slice(0, 3);
  // The user's own priorities win; the sample tasks only fill in when they skipped that step.
  // Tasks the coach gathered on the call (from what they said + their backstory) come first, then
  // the priorities from setup. Sample tasks only for someone who chose the demo calendar.
  const mine = [...agentTasks, ...profile.priorities.map((p) => ({ title: p.title, priority: "high" as const }))];
  const seen = new Set<string>();
  const unique = mine.filter((t) => {
    const k = t.title.toLowerCase().trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const tasks = unique.length ? unique : profile.demoCalendar ? fileTasks.map((t) => ({ title: t.title, priority: t.priority })) : [];
  const today = laDay(new Date());
  return {
    wake: profile.wakeTime,
    now: hhmm(new Date()),
    dayEnd: "22:30",
    // Today's timed events only (other days and all-day events never become blocks).
    events: calendar.events
      .filter((e) => !e.allDay && laDay(e.start) === today)
      .map((e) => ({ title: e.title, start: hhmm(e.start), end: laDay(e.end) === today ? hhmm(e.end) : "23:59" })),
    tasks,
    adjustments,
  };
}

// One shared, labeled sandbox for every request and every server instance: find it, restart it if
// it auto-stopped, and only create one when none exists. (Creating per request piles up sandboxes
// until Daytona's 10-CPU org limit refuses new ones.)
const LABELS = { app: "wake-planner" };
let sandboxPromise: Promise<Sandbox> | null = null;
async function findOrCreateSandbox(): Promise<Sandbox> {
  const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY });
  for await (const sb of daytona.list({ labels: LABELS })) {
    if (sb.state === "started") return sb;
    if (sb.state === "stopped") {
      await sb.start();
      return sb;
    }
  }
  return daytona.create({ language: "typescript", labels: LABELS, autoStopInterval: 30 });
}
function getSandbox(): Promise<Sandbox> {
  sandboxPromise ??= findOrCreateSandbox().catch((err) => {
    sandboxPromise = null;
    throw err;
  });
  return sandboxPromise;
}

// Ship the compiled planDay function itself into the sandbox, so it works in the deployed bundle
// (no source files there) and the sandbox always runs exactly the code the server has.
function plannerCode(input: PlanInput): string {
  return `const planDay = ${planDay.toString()};\nconsole.log(JSON.stringify(planDay(${JSON.stringify(input)})));`;
}

async function runInDaytona(input: PlanInput): Promise<PlanResult> {
  const sandbox = await getSandbox();
  const res = await sandbox.process.codeRun(plannerCode(input), undefined, 15);
  if (res.exitCode !== 0) throw new Error(`planner exited ${res.exitCode}: ${res.result.slice(0, 200)}`);
  // The sandbox can print npm notices around our output; take the line that is our JSON.
  const line = res.result.split("\n").map((l) => l.trim()).reverse().find((l) => l.startsWith('{"blocks"'));
  if (!line) throw new Error(`planner printed no plan: ${res.result.slice(0, 200)}`);
  return JSON.parse(line) as PlanResult;
}

export type PlanResponse = PlanResult & { source: "daytona" | "local"; ms: number; spoken: string };

export async function makePlan(
  adjustments: Adjustment[] = [],
  clientProfile?: Partial<Profile> | null,
  googleEvents?: CalEvent[] | null,
  agentTasks: PlanTask[] = [],
): Promise<PlanResponse> {
  const input = await buildPlanInput(adjustments, clientProfile, googleEvents, agentTasks);
  const t0 = Date.now();
  let result: PlanResult;
  let source: PlanResponse["source"] = "daytona";
  // One Daytona attempt, raced against a deadline so a slow sandbox never stalls the live call
  // (the agent's tool timeout is 25s). The identical function runs locally as the fallback.
  try {
    if (!process.env.DAYTONA_API_KEY) throw new Error("no DAYTONA_API_KEY");
    result = await Promise.race([
      runInDaytona(input),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Daytona deadline")), 9000)),
    ]);
  } catch (err) {
    console.warn("[plan] planning locally:", err);
    if (!(err instanceof Error && err.message === "Daytona deadline")) sandboxPromise = null;
    result = planDay(input);
    source = "local";
  }
  return { ...result, source, ms: Date.now() - t0, spoken: spokenPlan(result) };
}

function spokenClock(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const h12 = h % 12 || 12;
  const suffix = h < 12 ? "AM" : "PM";
  return m ? `${h12}:${String(m).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
}

// What a sharp assistant would say out loud: conflicts first, then what's next, the top task and
// any deadline. The full plan is on screen, so never read every block.
export function spokenPlan(r: PlanResult): string {
  const work = r.blocks.filter((b) => b.kind !== "routine");
  const next = work.find((b) => b.kind !== "deadline");
  const top = work.find((b) => b.kind === "task" && b !== next);
  const deadline = work.find((b) => b.kind === "deadline");
  const parts: string[] = [];
  if (r.conflicts.length) parts.push(`Heads up, ${r.conflicts[0]}.`);
  if (next) parts.push(`Next up: ${next.title} at ${spokenClock(next.start)}.`);
  if (top) parts.push(`${top.title} at ${spokenClock(top.start)}.`);
  if (deadline) parts.push(/\bdue\b/i.test(deadline.title) ? `${deadline.title} at ${spokenClock(deadline.start)}.` : `${deadline.title} is due at ${spokenClock(deadline.start)}.`);
  if (!parts.length) parts.push("The rest of today is open.");
  const shown = [next, top, deadline].filter(Boolean).length;
  if (work.length > shown) parts.push(`${work.length - shown} more on screen.`);
  if (r.unscheduled.length) parts.push(`Couldn't fit ${r.unscheduled.join(" and ")} today.`);
  return parts.join(" ");
}

const LOCK_FILE = path.join(process.cwd(), "data", "plan.json");
export async function lockPlan(blocks: Block[]) {
  const plan = { lockedAt: new Date().toISOString(), date: new Date().toLocaleDateString("en-CA", { timeZone: LA }), blocks };
  try {
    await fs.mkdir(path.dirname(LOCK_FILE), { recursive: true });
    await fs.writeFile(LOCK_FILE, JSON.stringify(plan, null, 2));
  } catch {
    // Read-only on Vercel; the locked plan lives in the browser there.
  }
  return plan;
}
