import { promises as fs } from "fs";
import path from "path";
import { DEFAULT_VOICE, getPreset, type VoicePresetId } from "./voices";

// One user per deployment (hackathon demo). Saved to web/data/profile.json, which is git-ignored
// because it holds a phone number. Falls back to env/demo values when nothing is saved yet.
export type Profile = {
  name: string;
  phone: string; // E.164, e.g. +16195550123
  wakeTime: string; // "07:30"
  days: number[]; // 0 = Sun ... 6 = Sat
  icalUrl?: string;
  priorities: { title: string; due: "today" | "tomorrow" | "week" }[];
  voice: VoicePresetId;
  coachName: string;
  aboutMe: string; // pasted from ChatGPT / Claude ("tell me everything you know about me") or typed
  language?: "en" | "es"; // optional so older saved setups still load
};

const FILE = path.join(process.cwd(), "data", "profile.json");

export const DEFAULT_PROFILE: Profile = {
  name: "",
  phone: "",
  wakeTime: "07:30",
  days: [1, 2, 3, 4, 5],
  icalUrl: "",
  priorities: [],
  voice: DEFAULT_VOICE,
  coachName: getPreset(DEFAULT_VOICE).defaultName,
  aboutMe: "",
  language: "en",
};

const clip = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");

export function sanitizeProfile(input: Partial<Profile>): Profile {
  const voice = getPreset(input.voice).id;
  const phoneDigits = clip(input.phone, 20).replace(/[^\d+]/g, "");
  return {
    name: clip(input.name, 40) || DEFAULT_PROFILE.name,
    phone: /^\+\d{10,15}$/.test(phoneDigits) ? phoneDigits : "",
    wakeTime: /^\d{2}:\d{2}$/.test(String(input.wakeTime)) ? String(input.wakeTime) : DEFAULT_PROFILE.wakeTime,
    days: Array.isArray(input.days) ? input.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : DEFAULT_PROFILE.days,
    icalUrl: clip(input.icalUrl, 500).replace(/^webcal:\/\//i, "https://"),
    priorities: Array.isArray(input.priorities)
      ? input.priorities
          .slice(0, 5)
          .map((p) => ({ title: clip(p?.title, 120), due: (["today", "tomorrow", "week"] as const).includes(p?.due) ? p.due : "week" }))
          .filter((p) => p.title)
      : [],
    voice,
    coachName: clip(input.coachName, 24) || getPreset(voice).defaultName,
    aboutMe: clip(input.aboutMe, 4000),
    language: input.language === "es" ? "es" : "en",
  };
}

// On Vercel each person's setup lives in their own browser (localStorage "wake.profile") and is
// sent with every request. The file is only a local-dev fallback.
export async function getProfile(clientProfile?: Partial<Profile> | null): Promise<Profile> {
  if (clientProfile && typeof clientProfile === "object") return sanitizeProfile(clientProfile);
  try {
    return sanitizeProfile(JSON.parse(await fs.readFile(FILE, "utf8")));
  } catch {
    return DEFAULT_PROFILE;
  }
}

export async function saveProfile(input: Partial<Profile>): Promise<Profile> {
  const profile = sanitizeProfile(input);
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(profile, null, 2));
  } catch {
    // Read-only filesystem on Vercel: the browser copy is the source of truth there.
  }
  return profile;
}
