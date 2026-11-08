"use client";
// Client-side copy of the user's setup. localStorage["wake.profile"] is the source of truth in the
// browser (planTools and briefing send it with every request); /api/profile is a best-effort mirror.
import type { Profile } from "@/lib/profile";
import { DEFAULT_VOICE, getPreset } from "@/lib/voices";
import { PROFILE_KEY } from "./planTools";

export function emptyProfile(): Profile {
  return {
    name: "",
    phone: "",
    wakeTime: "07:30",
    days: [1, 2, 3, 4, 5],
    icalUrl: "",
    priorities: [],
    voice: DEFAULT_VOICE,
    coachName: getPreset(DEFAULT_VOICE).defaultName,
    aboutMe: "",
  };
}

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Profile>;
    if (!p || typeof p !== "object") return null;
    return { ...emptyProfile(), ...p };
  } catch {
    return null;
  }
}

export function storeProfile(p: Profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* private mode etc. */
  }
}

/** Best effort: the server copy only matters for local dev. Never throws. */
export function syncProfile(p: Profile) {
  void fetch("/api/profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(p),
  }).catch(() => {});
}

export function isComplete(p: Profile | null): p is Profile {
  return !!p && p.name.trim().length > 0 && /^\d{2}:\d{2}$/.test(p.wakeTime);
}

// ---- Phone helpers (US only for the demo) ----
export function phoneDigits(s: string): string {
  return s.replace(/\D/g, "").replace(/^1(?=\d{10})/, "").slice(0, 10);
}
export function formatPhone(digits: string): string {
  const d = phoneDigits(digits);
  if (d.length === 0) return "";
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
export function toE164(digits: string): string {
  const d = phoneDigits(digits);
  return d.length === 10 ? `+1${d}` : "";
}

export function formatWakeTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function formatDays(days: number[]): string {
  const s = [...days].sort((a, b) => a - b);
  if (s.length === 7) return "Every day";
  if (s.join() === "1,2,3,4,5") return "Weekdays";
  if (s.join() === "0,6") return "Weekends";
  if (s.length === 0) return "No days";
  return s.map((d) => DAY_SHORT[d]).join(" ");
}
