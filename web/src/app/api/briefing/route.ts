import { NextResponse } from "next/server";
import { getBriefing } from "@/lib/briefing";
import type { Profile } from "@/lib/profile";
import type { CalEvent } from "@/lib/calendar";
import { clientEvents } from "@/lib/client-events";

export const dynamic = "force-dynamic";

export async function GET() {
  return respond(null);
}

// POST { profile } — the browser sends its saved setup (localStorage "wake.profile").
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { profile?: Partial<Profile>; calendarEvents?: unknown; calendarStatus?: string };
  return respond(body.profile ?? null, clientEvents(body.calendarEvents), body.calendarStatus);
}

async function respond(profile: Partial<Profile> | null, events: CalEvent[] | null = null, calendarStatus?: string) {
  try {
    return NextResponse.json(await getBriefing(profile, events, calendarStatus));
  } catch (err) {
    // Should never happen (each source has its own fallback), but never 500 the alarm.
    console.error("[briefing] hard fallback:", err);
    return NextResponse.json({
      name: "there",
      date: new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "long", month: "long", day: "numeric" }).format(new Date()),
      weather_summary: "I couldn't grab the weather this morning, so take a quick look outside before you head out.",
      calendar_summary: "I couldn't load your calendar, so give it a quick check.",
      tasks_summary: "I couldn't load your to-do list, so check it when you get a sec.",
    });
  }
}
