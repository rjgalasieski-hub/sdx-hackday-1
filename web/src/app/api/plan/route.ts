import { NextResponse } from "next/server";
import { makePlan } from "@/lib/plan";
import type { Adjustment } from "@/lib/planner-core";

export const dynamic = "force-dynamic";

// POST { adjustments?: Adjustment[] } -> plan computed in a Daytona sandbox (local fallback)
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { adjustments?: Adjustment[] };
  const adjustments = Array.isArray(body.adjustments) ? body.adjustments.slice(0, 20) : [];
  return NextResponse.json(await makePlan(adjustments));
}
