import { NextResponse } from "next/server";
import { getBriefing } from "@/lib/briefing";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getBriefing());
  } catch (err) {
    // Should never happen (each source has its own fallback), but never 500 the alarm.
    console.error("[briefing] hard fallback:", err);
    return NextResponse.json({
      name: (process.env.USER_NAME ?? "").trim() || "RJ",
      date: new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "long", month: "long", day: "numeric" }).format(new Date()),
      weather_summary: "I couldn't grab the weather this morning, so take a quick look outside before you head out.",
      calendar_summary: "I couldn't load your calendar, so give it a quick check.",
      tasks_summary: "I couldn't load your to-do list, so check it when you get a sec.",
    });
  }
}
