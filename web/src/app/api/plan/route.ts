import { NextResponse } from "next/server";
import { makePlan } from "@/lib/plan";
import type { Adjustment } from "@/lib/planner-core";
import type { Profile } from "@/lib/profile";

export const dynamic = "force-dynamic";
// Cold Daytona sandbox ~6s + run ~1s; leave headroom.
export const maxDuration = 30;

// POST { adjustments?: Adjustment[] } -> plan computed in a Daytona sandbox (local fallback)
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { adjustments?: Adjustment[]; profile?: Partial<Profile> };
  const adjustments = Array.isArray(body.adjustments) ? body.adjustments.slice(0, 20) : [];
  return NextResponse.json(await makePlan(adjustments, body.profile ?? null));
}
