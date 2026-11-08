import { getCalendar, type CalEvent } from "./calendar";
import { getTasks, type Task } from "./tasks";
import { getWeather, type Weather } from "./weather";
import { getProfile, type Profile } from "./profile";
import { getPreset } from "./voices";
import { addDaysToKey, laDateKey, speakable, spokenDate, spokenDue, spokenTime } from "./time";

export type Briefing = {
  name: string;
  date: string;
  weather_summary: string;
  calendar_summary: string;
  tasks_summary: string;
  coach_name: string;
  personality: string;
  about_me: string;
  voice_id: string;
};

const NUM_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const count = (n: number) => NUM_WORDS[n] ?? String(n);

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function weatherSummary(w: Weather): string {
  const rain =
    w.precipChance < 20
      ? "no rain expected"
      : w.precipChance < 50
        ? `a ${w.precipChance} percent chance of rain`
        : `rain likely, ${w.precipChance} percent chance`;
  // "61 and foggy" reads well; "61 and light rain" doesn't, so use "with" for precipitation words
  const cond = w.conditions.toLowerCase();
  const adjective = /^(clear|mostly clear|partly cloudy|overcast|foggy)$/.test(cond);
  return speakable(
    `It's ${w.tempF} ${adjective ? "and" : "with"} ${cond} right now, with a high of ${w.highF} and a low of ${w.lowF}, ${rain}. ${w.wear}`,
  );
}

function eventPhrase(e: CalEvent): string {
  const loc = e.location && e.location.length <= 40 && !/^https?:/i.test(e.location) ? ` in ${e.location}` : "";
  if (e.allDay) return `${e.title}, all day`;
  const start = new Date(e.start);
  const isDeadline = e.start === e.end || /\bdue\b/i.test(e.title);
  if (isDeadline) return `${e.title} at ${spokenTime(start)}`;
  return `${e.title} at ${spokenTime(start)}${loc}`;
}

export function calendarSummary(events: CalEvent[]): string {
  if (!events.length) return "Your calendar is wide open today, nothing scheduled.";
  const shown = events.slice(0, 6).map(eventPhrase);
  const more = events.length > 6 ? ` Plus ${count(events.length - 6)} more after that.` : "";
  const lead = events.length === 1 ? "You've got one thing on the calendar today:" : `You've got ${count(events.length)} things on the calendar today:`;
  return speakable(`${lead} ${joinList(shown)}.${more}`);
}

export function tasksSummary(tasks: Task[]): string {
  if (!tasks.length) return "Your to-do list is clear. Nice.";
  const today = laDateKey();
  const [top, ...rest] = tasks;
  let text = `Top priority: ${lowerFirst(top.title)}, due ${spokenDue(top.due, today)}.`;
  const next = rest.slice(0, 3).map((t) => `${lowerFirst(t.title)}, due ${spokenDue(t.due, today)}`);
  if (next.length) text += ` After that: ${joinList(next)}.`;
  if (rest.length > 3) text += ` And ${count(rest.length - 3)} smaller thing${rest.length - 3 === 1 ? "" : "s"} on the list.`;
  return speakable(text);
}

function lowerFirst(s: string): string {
  // lowercase a leading verb ("Finish the paper" -> "finish the paper") but keep acronyms/proper nouns ("SDx", "ARC")
  return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

// Priorities typed in onboarding go first, then the task file.
function profileTasks(p: Profile): Task[] {
  const today = laDateKey();
  const offset = { today: 0, tomorrow: 1, week: 5 } as const;
  return p.priorities.map((t) => ({ title: t.title, due: addDaysToKey(today, offset[t.due]), priority: "high" as const }));
}

export async function getBriefing(clientProfile?: Partial<Profile> | null): Promise<Briefing> {
  const profile = await getProfile(clientProfile);
  const preset = getPreset(profile.voice);
  const [weather, calendar] = await Promise.all([getWeather(), getCalendar(profile.icalUrl)]);
  const tasks = [...profileTasks(profile), ...getTasks().tasks];
  return {
    name: profile.name,
    date: spokenDate(),
    weather_summary: weatherSummary(weather),
    calendar_summary: calendarSummary(calendar.events),
    tasks_summary: tasksSummary(tasks),
    coach_name: profile.coachName,
    personality: preset.personality,
    about_me: profile.aboutMe || "Nothing shared yet.",
    voice_id: preset.voiceId,
  };
}
