import { NextResponse } from "next/server";
import { makePlan } from "@/lib/plan";
import type { Adjustment, PlanTask } from "@/lib/planner-core";
import type { Profile } from "@/lib/profile";
import { clientEvents } from "@/lib/client-events";

export const dynamic = "force-dynamic";
// Cold Daytona sandbox ~6s + run ~1s; leave headroom.
export const maxDuration = 30;

// POST { adjustments?: Adjustment[] } -> plan computed in a Daytona sandbox (local fallback)
// Tasks the agent passes from the conversation: [{ title, minutes?, priority? }]
function agentTasks(input: unknown): PlanTask[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 8)
    .map((t) => ({
      title: typeof t?.title === "string" ? t.title.trim().slice(0, 80) : "",
      priority: (["high", "medium", "low"].includes(t?.priority) ? t.priority : "high") as PlanTask["priority"],
      minutes: typeof t?.minutes === "number" && t.minutes >= 10 && t.minutes <= 240 ? Math.round(t.minutes) : undefined,
    }))
    .filter((t) => t.title);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { adjustments?: Adjustment[]; profile?: Partial<Profile>; calendarEvents?: unknown; tasks?: unknown };
  const adjustments = Array.isArray(body.adjustments) ? body.adjustments.slice(0, 20) : [];
  return NextResponse.json(await makePlan(adjustments, body.profile ?? null, clientEvents(body.calendarEvents), agentTasks(body.tasks)));
}
