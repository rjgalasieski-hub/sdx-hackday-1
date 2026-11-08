import { NextResponse } from "next/server";
import { makePlan } from "@/lib/plan";
import type { Adjustment, PlanTask } from "@/lib/planner-core";
import type { Profile } from "@/lib/profile";
import { clientEvents } from "@/lib/client-events";

export const dynamic = "force-dynamic";
// Cold Daytona sandbox ~6s + run ~1s; leave headroom.
export const maxDuration = 30;

// POST { adjustments?: Adjustment[] } -> plan computed in a Daytona sandbox (local fallback)
const clampMinutes = (m: unknown) =>
  typeof m === "number" && Number.isFinite(m) ? Math.min(240, Math.max(10, Math.round(m))) : undefined;

// "18:00", "6:30", "6 PM", "6pm", "2" -> "HH:MM". Bare hours 1-6 mean afternoon (nobody naps at 2 AM).
function normalizeTime(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*$/i.exec(raw);
  if (!m) return undefined;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ampm = m[3]?.toLowerCase();
  if (ampm?.startsWith("p") && h < 12) h += 12;
  if (ampm?.startsWith("a") && h === 12) h = 0;
  if (!ampm && h >= 1 && h <= 6) h += 12;
  if (h > 23 || min > 59) return undefined;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function cleanAdjustment(a: unknown): Adjustment | null {
  const x = a as { title?: unknown; start?: unknown; minutes?: unknown; remove?: unknown };
  const title = typeof x?.title === "string" ? x.title.trim().slice(0, 80) : "";
  if (!title) return null;
  return { title, start: normalizeTime(x.start), minutes: clampMinutes(x.minutes), remove: x.remove === true };
}

// Tasks the agent passes from the conversation: [{ title, minutes?, priority? }]
function agentTasks(input: unknown): PlanTask[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 8)
    .map((t) => ({
      title: typeof t?.title === "string" ? t.title.trim().slice(0, 80) : "",
      priority: (["high", "medium", "low"].includes(t?.priority) ? t.priority : "medium") as PlanTask["priority"],
      minutes: clampMinutes(t?.minutes),
    }))
    .filter((t) => t.title);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { adjustments?: Adjustment[]; profile?: Partial<Profile>; calendarEvents?: unknown; tasks?: unknown };
  const adjustments = Array.isArray(body.adjustments) ? body.adjustments.slice(0, 20).map(cleanAdjustment).filter(Boolean) as Adjustment[] : [];
  return NextResponse.json(await makePlan(adjustments, body.profile ?? null, clientEvents(body.calendarEvents), agentTasks(body.tasks)));
}
