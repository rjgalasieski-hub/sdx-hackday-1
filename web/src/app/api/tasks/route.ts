import { NextResponse } from "next/server";
import { getTasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getTasks());
}
