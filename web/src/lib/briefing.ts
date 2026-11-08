import { getCalendar, type CalEvent } from "./calendar";
import { getTasks, type Task } from "./tasks";
import { getWeather, type Weather } from "./weather";
import { laDateKey, speakable, spokenDate, spokenDue, spokenTime } from "./time";

export type Briefing = {
  name: string;
  date: string;
  weather_summary: string;
  calendar_summary: string;
  tasks_summary: string;
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

export async function getBriefing(): Promise<Briefing> {
  const [weather, calendar] = await Promise.all([getWeather(), getCalendar()]);
  const tasks = getTasks();
  return {
    name: (process.env.USER_NAME ?? "").trim() || "RJ",
    date: spokenDate(),
    weather_summary: weatherSummary(weather),
    calendar_summary: calendarSummary(calendar.events),
    tasks_summary: tasksSummary(tasks.tasks),
  };
}
