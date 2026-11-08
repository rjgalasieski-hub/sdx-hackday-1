import { promises as fs } from "fs";
import path from "path";
import { Daytona, type Sandbox } from "@daytonaio/sdk";
import { getCalendar } from "./calendar";
import { getProfile } from "./profile";
import { getTasks } from "./tasks";
import { planDay, type Adjustment, type Block, type PlanInput, type PlanResult } from "./planner-core";

const LA = "America/Los_Angeles";
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: LA, hour: "2-digit", minute: "2-digit", hour12: false });

export async function buildPlanInput(adjustments: Adjustment[]): Promise<PlanInput> {
  const profile = await getProfile();
  const calendar = await getCalendar(profile.icalUrl);
  const fileTasks = getTasks().tasks.slice(0, 3);
  const tasks = [
    ...profile.priorities.map((p) => ({ title: p.title, priority: "high" as const })),
    ...fileTasks.map((t) => ({ title: t.title, priority: t.priority })),
  ];
  return {
    wake: profile.wakeTime,
    dayEnd: "22:30",
    events: calendar.events.filter((e) => !e.allDay).map((e) => ({ title: e.title, start: hhmm(e.start), end: hhmm(e.end) })),
    tasks,
    adjustments,
  };
}

// One warm sandbox per server process so each plan is ~1s, not a cold start.
let sandboxPromise: Promise<Sandbox> | null = null;
function getSandbox(): Promise<Sandbox> {
  if (!sandboxPromise) {
    const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY });
    sandboxPromise = daytona.create({ language: "typescript", autoStopInterval: 60 }).catch((err) => {
      sandboxPromise = null;
      throw err;
    });
  }
  return sandboxPromise;
}

let plannerSource: string | null = null;
async function plannerCode(input: PlanInput): Promise<string> {
  plannerSource ??= (await fs.readFile(path.join(process.cwd(), "src/lib/planner-core.ts"), "utf8")).replace(/^export /gm, "");
  return `${plannerSource}\nconsole.log(JSON.stringify(planDay(${JSON.stringify(input)})));`;
}

async function runInDaytona(input: PlanInput): Promise<PlanResult> {
  const sandbox = await getSandbox();
  const res = await sandbox.process.codeRun(await plannerCode(input), undefined, 15);
  if (res.exitCode !== 0) throw new Error(`planner exited ${res.exitCode}: ${res.result.slice(0, 200)}`);
  const line = res.result.trim().split("\n").pop() ?? "";
  return JSON.parse(line) as PlanResult;
}

export type PlanResponse = PlanResult & { source: "daytona" | "local"; ms: number; spoken: string };

export async function makePlan(adjustments: Adjustment[] = []): Promise<PlanResponse> {
  const input = await buildPlanInput(adjustments);
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
  await fs.mkdir(path.dirname(LOCK_FILE), { recursive: true });
  await fs.writeFile(LOCK_FILE, JSON.stringify(plan, null, 2));
  return plan;
}
