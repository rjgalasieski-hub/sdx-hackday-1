"use client";
// Settings: one page, grouped cards, every control writes straight to localStorage["wake.profile"]
// (auto-save) and mirrors to /api/profile a moment later. Reuses the onboarding step bodies in
// `embedded` mode so the voice cards, time chips and priorities look identical to first-run setup.
import type { Profile } from "@/lib/profile";
import { getPreset } from "@/lib/voices";
import { AlarmClock, ArrowLeft, BookOpen, CalendarDays, Check, ListChecks, Mic2, RotateCcw, User, Wrench } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { APP_NAME } from "./config";
import { isGoogleConnected } from "./googleCalendar";
import { CalendarStep, ContextStep, PrioritiesStep, TimeStep, VoiceStep, type CalendarChoice } from "./Onboarding";
import { formatDays, formatWakeTime, storeProfile, syncProfile } from "./profile-store";

type Props = {
  initial: Profile;
  onBack: (p: Profile) => void;
  onReset: () => void;
};

const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Next ring, honoring the weekday toggles. Null when no day is on or the time is malformed. */
export function nextAlarm(wakeTime: string, days: number[]): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(wakeTime);
  if (!m || days.length === 0) return null;
  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (d.getTime() > now.getTime() && days.includes(d.getDay())) return d;
  }
  return null;
}

function describeNext(d: Date | null): string {
  if (!d) return "No days selected, so the alarm won't ring.";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const when = sameDay ? "Today" : isTomorrow ? "Tomorrow" : DAY_LONG[d.getDay()];
  return `${when} at ${formatWakeTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`)}`;
}

/** Every wake.* key: profile, Google token, anything a later feature adds under the same prefix. */
function clearWakeStorage() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("wake.")) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* private mode etc. */
  }
}

export function Settings({ initial, onBack, onReset }: Props) {
  const [profile, setProfile] = useState<Profile>(initial);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [calendarChoice, setCalendarChoice] = useState<CalendarChoice>(() =>
    initial.icalUrl || (typeof window !== "undefined" && isGoogleConnected()) ? "google" : "demo",
  );
  const [resetArmed, setResetArmed] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save: localStorage on every keystroke, the server mirror 600 ms after the last change.
  const update = useCallback((patch: Partial<Profile>) => {
    setProfile((p) => {
      const next = { ...p, ...patch };
      storeProfile(next);
      return next;
    });
    setSaveState("saving");
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      setProfile((p) => {
        syncProfile(p);
        return p;
      });
      setSaveState("saved");
    }, 600);
  }, []);

  useEffect(
    () => () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  function finalProfile(): Profile {
    // Never hand Home a blank name or coach: fall back to what we came in with.
    const name = profile.name.trim() || initial.name;
    const coachName = profile.coachName.trim() || getPreset(profile.voice).defaultName;
    const final = { ...profile, name, coachName };
    storeProfile(final);
    if (saveState === "saving") syncProfile(final);
    return final;
  }

  function back() {
    onBack(finalProfile());
  }

  function tapReset() {
    if (!resetArmed) {
      setResetArmed(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setResetArmed(false), 6000);
      return;
    }
    clearWakeStorage();
    onReset();
  }

  const next = nextAlarm(profile.wakeTime, profile.days);

  return (
    <div className="sunrise screen-enter flex min-h-dvh flex-col" style={{ "--sun": 0.25 } as React.CSSProperties}>
      <header className="glass-bar">
        <div className="mx-auto flex w-full max-w-[640px] items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-0">
          <button type="button" onClick={back} className="btn-text -ml-2 pl-2" aria-label="Back to home">
            <ArrowLeft className="size-5" aria-hidden />
            <span className="hidden sm:inline">Home</span>
          </button>
          <h1 className="flex-1 text-center font-display text-xl font-bold">Settings</h1>
          <SaveIndicator state={saveState} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-4 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5 sm:px-0 sm:pt-8">
        <Section icon={<User className="size-5" aria-hidden />} title="You">
          <label htmlFor="settings-name" className="label">
            Your first name
          </label>
          <input
            id="settings-name"
            className="field text-lg"
            autoComplete="given-name"
            maxLength={40}
            value={profile.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="Your first name"
          />
        </Section>

        <Section icon={<Mic2 className="size-5" aria-hidden />} title="Your coach" sub="Tap play to hear them. This is who wakes you up.">
          <VoiceStep profile={profile} update={update} embedded />
        </Section>

        <Section icon={<AlarmClock className="size-5" aria-hidden />} title="Wake-up">
          <TimeStep profile={profile} update={update} embedded />
          <div className="mt-1 flex items-center justify-between gap-4 rounded-2xl bg-black/50 px-4 py-3" aria-live="polite">
            <span className="text-sm text-[var(--muted)]">Next alarm</span>
            <span className={`text-right font-medium ${next ? "tnum" : "text-[var(--warn)]"}`}>{describeNext(next)}</span>
          </div>
        </Section>

        <Section
          icon={<CalendarDays className="size-5" aria-hidden />}
          title="Calendar"
          sub={`${APP_NAME} reads today's events so the plan fits around real life.`}
        >
          <CalendarStep
            profile={profile}
            update={update}
            choice={calendarChoice}
            setChoice={setCalendarChoice}
            onSkip={() => {}}
            embedded
          />
        </Section>

        <Section icon={<ListChecks className="size-5" aria-hidden />} title="Priorities" sub="Up to three. Your coach schedules them into the day.">
          <PrioritiesStep profile={profile} update={update} embedded />
        </Section>

        <Section
          icon={<BookOpen className="size-5" aria-hidden />}
          title="Backstory"
          sub={`What ${profile.coachName.trim() || getPreset(profile.voice).defaultName} knows about you. It's a paste, not a login.`}
        >
          <ContextStep profile={profile} update={update} embedded />
        </Section>

        <Section icon={<Wrench className="size-5" aria-hidden />} title="Demo tools" sub="For showing Wake to someone new." tone="muted">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">Reset {APP_NAME}</p>
              <p className="text-sm text-[var(--muted)]">
                Clears this browser&apos;s setup ({formatWakeTime(profile.wakeTime)} · {formatDays(profile.days)}) and the calendar connection, then
                starts onboarding fresh.
              </p>
            </div>
            <button
              type="button"
              onClick={tapReset}
              className={`shrink-0 ${resetArmed ? "btn-end" : "btn-ghost"}`}
              aria-live="polite"
              aria-describedby="reset-help"
            >
              <RotateCcw className="size-4" aria-hidden />
              {resetArmed ? "Tap again to reset" : "Reset Wake"}
            </button>
          </div>
          <p id="reset-help" className="sr-only">
            Tap once to arm, tap a second time within six seconds to confirm.
          </p>
          {resetArmed && (
            <p className="fade-in text-sm text-[var(--warn)]" role="status">
              This can&apos;t be undone. Tap the button again to wipe everything, or wait and it disarms.
            </p>
          )}
        </Section>

        <button type="button" onClick={back} className="btn-primary mt-2 w-full sm:self-center sm:min-w-72">
          Done
        </button>
      </main>
    </div>
  );
}

// ---------------- Pieces ----------------

function Section({
  icon,
  title,
  sub,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
  tone?: "muted";
  children: React.ReactNode;
}) {
  const id = `sec-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section className={`card flex flex-col gap-4 p-4 sm:p-5 ${tone === "muted" ? "border-dashed" : ""}`} aria-labelledby={id}>
      <div className="flex items-start gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--surface-2)] ${tone === "muted" ? "text-[var(--muted)]" : "text-[var(--gold)]"}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <h2 id={id} className="font-display text-lg font-bold leading-tight">
            {title}
          </h2>
          {sub && <p className="mt-0.5 text-sm text-[var(--muted)]">{sub}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function SaveIndicator({ state }: { state: "idle" | "saving" | "saved" }) {
  return (
    <span
      className={`tnum flex min-w-[76px] items-center justify-end gap-1 text-sm transition-opacity ${state === "idle" ? "opacity-0" : "opacity-100"} ${state === "saved" ? "text-[var(--ok)]" : "text-[var(--muted)]"}`}
      role="status"
      aria-live="polite"
    >
      {state === "saved" && <Check className="size-4" aria-hidden />}
      {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : ""}
    </span>
  );
}
