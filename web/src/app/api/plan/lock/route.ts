import { NextResponse } from "next/server";
import { lockPlan } from "@/lib/plan";
import type { Block } from "@/lib/planner-core";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { blocks?: Block[] };
  if (!Array.isArray(body.blocks) || !body.blocks.length) {
    return NextResponse.json({ ok: false, error: "No plan to lock yet." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, plan: await lockPlan(body.blocks.slice(0, 30)) });
}
