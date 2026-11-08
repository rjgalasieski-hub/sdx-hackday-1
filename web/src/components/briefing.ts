// Client-side helpers for the briefing. Keys match CONTRACT.md exactly.
import { BRIEFING_TIMEOUT_MS } from "./config";
import { getGoogleEvents, isGoogleExpired } from "./googleCalendar";
import type { Profile } from "@/lib/profile";
import { getPreset } from "@/lib/voices";

export const BRIEFING_KEYS = [
  "name",
  "date",
  "weather_summary",
  "calendar_summary",
  "tasks_summary",
  "coach_name",
  "personality",
  "about_me",
  "voice_id",
  "language",
  "language_name",
] as const;

export type BriefingKey = (typeof BRIEFING_KEYS)[number];
export type Briefing = Record<BriefingKey, string> & { source?: string };

export type BriefingResult = { briefing: Briefing; fromFallback: boolean };

function todayString() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// Used when /api/briefing times out. Built from this user's saved setup only: never a made-up
// name, class or weather, so the coach doesn't brief someone on a day that isn't theirs.
export function fallbackBriefing(): Briefing {
  let p: Partial<Profile> | null = null;
  try {
    p = JSON.parse(localStorage.getItem("wake.profile") ?? "null");
  } catch {}
  const preset = getPreset(p?.voice);
  const priorities = Array.isArray(p?.priorities) ? p.priorities.map((x) => x?.title).filter(Boolean) : [];
  return {
    name: p?.name?.trim() || "there",
    date: todayString(),
    weather_summary: "I couldn't grab the weather this morning, so take a quick look outside before you head out.",
    calendar_summary: "I couldn't load your calendar this morning, so ask what's on today.",
    tasks_summary: priorities.length
      ? `Your priorities are ${priorities.join(", ")}.`
      : "No priorities saved yet, so ask what matters most today.",
    coach_name: p?.coachName?.trim() || preset.defaultName,
    personality: preset.personality,
    about_me: p?.aboutMe?.trim() || "Nothing shared yet.",
    voice_id: preset.voiceId,
    language: p?.language === "es" ? "es" : "en",
    language_name: p?.language === "es" ? "Spanish" : "English",
    source: "fallback",
  };
}

/** Fetches /api/briefing. Never throws: on any failure it returns local demo text. */
export async function fetchBriefing(): Promise<BriefingResult> {
  const fallback = fallbackBriefing();
  // Google gets its own budget so a slow calendar can't eat the briefing request's timeout.
  const calendarEvents = await Promise.race([
    getGoogleEvents(),
    new Promise<null>((r) => setTimeout(() => r(null), 4_000)),
  ]).catch(() => null);
  const calendarStatus = calendarEvents ? "ok" : isGoogleExpired() ? "expired" : "none";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BRIEFING_TIMEOUT_MS);
  try {
    let profile: unknown = null;
    try {
      profile = JSON.parse(localStorage.getItem("wake.profile") ?? "null");
    } catch {}
    const res = await fetch("/api/briefing", {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile, calendarEvents, calendarStatus }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as Partial<Record<string, unknown>>;
    const briefing = { ...fallback } as Briefing;
    let missing = 0;
    for (const key of BRIEFING_KEYS) {
      const v = json[key];
      if (typeof v === "string" && v.trim()) briefing[key] = v;
      else if (typeof v === "number" || typeof v === "boolean") briefing[key] = String(v);
      else missing++;
    }
    briefing.source = typeof json.source === "string" ? json.source : "live";
    return { briefing, fromFallback: missing === BRIEFING_KEYS.length };
  } catch (err) {
    console.warn("[briefing] using fallback:", err);
    return { briefing: fallback, fromFallback: true };
  } finally {
    clearTimeout(timer);
  }
}

/** Exactly the five dynamic variables the agent expects, all strings. */
export function toDynamicVariables(b: Briefing): Record<BriefingKey, string> {
  const out = {} as Record<BriefingKey, string>;
  for (const key of BRIEFING_KEYS) out[key] = b[key];
  return out;
}

// ---- Optional structured detail for the on-screen cards (never blocks the conversation) ----

export type WeatherDetail = {
  location?: string;
  tempF?: number;
  highF?: number;
  lowF?: number;
  precipChance?: number;
  conditions?: string;
  wear?: string;
};
export type CalendarEvent = {
  title: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  location?: string;
};
export type Task = { title: string; due?: string; priority?: string | number };
export type Details = {
  weather?: WeatherDetail;
  events?: CalendarEvent[];
  tasks?: Task[];
};

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BRIEFING_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchDetails(): Promise<Details> {
  // Only weather is shared; calendar and tasks come from THIS user's own data (their Google
  // events and their saved priorities), never the server's sample day.
  const [w, google] = await Promise.all([getJson("/api/weather"), getGoogleEvents()]);
  const details: Details = {};
  if (w && (typeof w.tempF === "number" || typeof w.conditions === "string")) {
    details.weather = w as WeatherDetail;
  }
  if (google) details.events = google as unknown as CalendarEvent[];
  try {
    const p = JSON.parse(localStorage.getItem("wake.profile") ?? "null") as { priorities?: { title: string; due: string }[] } | null;
    if (p?.priorities?.length) {
      details.tasks = p.priorities.map((x) => ({ title: x.title, due: x.due, priority: "high" })) as unknown as Task[];
    }
  } catch {}
  return details;
}
