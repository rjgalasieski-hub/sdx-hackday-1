import { NextResponse } from "next/server";
import { getCalendar } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getCalendar());
}
