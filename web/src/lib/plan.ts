import { promises as fs } from "fs";
import path from "path";
import { Daytona, type Sandbox } from "@daytonaio/sdk";
import { getCalendar, type CalEvent } from "./calendar";
import { getProfile, type Profile } from "./profile";
import { getTasks } from "./tasks";
import { planDay, type Adjustment, type Block, type PlanInput, type PlanResult } from "./planner-core";

const LA = "America/Los_Angeles";
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: LA, hour: "2-digit", minute: "2-digit", hour12: false });

export async function buildPlanInput(adjustments: Adjustment[], clientProfile?: Partial<Profile> | null, googleEvents?: CalEvent[] | null): Promise<PlanInput> {
  const profile = await getProfile(clientProfile);
  const calendar = googleEvents ? { events: googleEvents } : await getCalendar(profile.icalUrl);
  const fileTasks = getTasks().tasks.slice(0, 3);
  // The user's own priorities win; the sample tasks only fill in when they skipped that step.
  const mine = profile.priorities.map((p) => ({ title: p.title, priority: "high" as const }));
  const tasks = mine.length ? mine : fileTasks.map((t) => ({ title: t.title, priority: t.priority }));
  return {
    wake: profile.wakeTime,
    dayEnd: "22:30",
    events: calendar.events.filter((e) => !e.allDay).map((e) => ({ title: e.title, start: hhmm(e.start), end: hhmm(e.end) })),
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

export async function makePlan(adjustments: Adjustment[] = [], clientProfile?: Partial<Profile> | null, googleEvents?: CalEvent[] | null): Promise<PlanResponse> {
  const input = await buildPlanInput(adjustments, clientProfile, googleEvents);
  const t0 = Date.now();
  let result: PlanResult;
  let source: PlanResponse["source"] = "daytona";
  try {
    if (!process.env.DAYTONA_API_KEY) throw new Error("no DAYTONA_API_KEY");
    result = await runInDaytona(input);
  } catch (err) {
    console.warn("[plan] Daytona failed, retrying once:", err);
    sandboxPromise = null;
    try {
      result = await runInDaytona(input);
    } catch (err2) {
      console.warn("[plan] Daytona failed again, planning locally:", err2);
      result = planDay(input);
      source = "local";
    }
  }
  return { ...result, source, ms: Date.now() - t0, spoken: spokenPlan(result.blocks, result.unscheduled) };
}

function spokenClock(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const h12 = h % 12 || 12;
  const suffix = h < 12 ? "AM" : "PM";
  return m ? `${h12}:${String(m).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
}

export function spokenPlan(blocks: Block[], unscheduled: string[]): string {
  const parts = blocks.map((b) => (b.kind === "deadline" ? `${b.title} at ${spokenClock(b.start)}` : `${spokenClock(b.start)} ${b.title}`));
  let text = `Plan: ${parts.join(", then ")}.`;
  if (unscheduled.length) text += ` Couldn't fit: ${unscheduled.join(", ")}.`;
  return text;
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
