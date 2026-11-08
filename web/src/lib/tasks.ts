import raw from "@/data/tasks.json";
import { addDaysToKey, laDateKey } from "./time";

export type Priority = "high" | "medium" | "low";
export type Task = { title: string; due: string; priority: Priority };
export type TasksResult = { source: "file" | "demo"; tasks: Task[] };

// tasks.json entries use either "due": "YYYY-MM-DD" or "dueInDays": N (relative to today in LA,
// so the demo never goes stale). The API always returns `due` as a YYYY-MM-DD string.
type RawTask = { title: string; due?: string; dueInDays?: number; priority?: string };

const RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export function getTasks(): TasksResult {
  try {
    const today = laDateKey();
    const tasks: Task[] = (raw as RawTask[])
      .filter((t) => t && typeof t.title === "string" && t.title.trim())
      .map((t) => {
        const priority: Priority = t.priority === "high" || t.priority === "low" ? t.priority : "medium";
        const due =
          typeof t.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.due)
            ? t.due
            : addDaysToKey(today, typeof t.dueInDays === "number" ? t.dueInDays : 0);
        return { title: t.title.trim(), due, priority };
      })
      .sort((a, b) => RANK[a.priority] - RANK[b.priority] || a.due.localeCompare(b.due));
    return { source: "file", tasks };
  } catch (err) {
    console.error("[tasks] falling back to demo:", err);
    const today = laDateKey();
    return {
      source: "demo",
      tasks: [
        { title: "Finish the market research paper", due: today, priority: "high" },
        { title: "Study for the accounting midterm", due: addDaysToKey(today, 3), priority: "medium" },
      ],
    };
  }
}
