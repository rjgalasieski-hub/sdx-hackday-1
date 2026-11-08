// Client-side helpers for the briefing. Keys match CONTRACT.md exactly.
import { BRIEFING_TIMEOUT_MS } from "./config";

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

export function fallbackBriefing(): Briefing {
  return {
    name: "there",
    date: todayString(),
    weather_summary:
      "It's about 64 degrees and partly cloudy right now, with a high of 71. Light layers should do it.",
    calendar_summary:
      "You have a class at 10 AM, lunch with the team at noon, and a project sync at 3 PM.",
    tasks_summary:
      "Your top priorities are finishing the hackathon demo, replying to two emails, and getting a workout in.",
    coach_name: "Sunny",
    personality: "Warm and playful, like a friend who already has coffee.",
    about_me: "Nothing shared yet.",
    voice_id: "cgSgspJ2msm6clMCkdW9",
    source: "fallback",
  };
}

/** Fetches /api/briefing. Never throws: on any failure it returns local demo text. */
export async function fetchBriefing(): Promise<BriefingResult> {
  const fallback = fallbackBriefing();
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
      body: JSON.stringify({ profile }),
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
  const [w, c, t] = await Promise.all([
    getJson("/api/weather"),
    getJson("/api/calendar"),
    getJson("/api/tasks"),
  ]);
  const details: Details = {};
  if (w && (typeof w.tempF === "number" || typeof w.conditions === "string")) {
    details.weather = w as WeatherDetail;
  }
  if (c && Array.isArray(c.events)) {
    details.events = (c.events as CalendarEvent[]).filter((e) => e && typeof e.title === "string");
  }
  if (t && Array.isArray(t.tasks)) {
    details.tasks = (t.tasks as Task[]).filter((x) => x && typeof x.title === "string");
  }
  return details;
}
