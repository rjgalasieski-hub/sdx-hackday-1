"use client";
// First-run setup: 0 welcome, 1 name, 2 phone, 3 wake time, 4 calendar, 5 priorities,
// 6 voice + coach name, 6b context import, 7 done. Saves to localStorage on every step and
// POSTs to /api/profile at the end (best effort).
import type { Profile } from "@/lib/profile";
import { VOICE_PRESETS, getPreset, type VoicePresetId } from "@/lib/voices";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  MessageSquare,
  Pause,
  PenLine,
  Phone,
  PhoneIncoming,
  Play,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Logo, Wordmark } from "./Logo";
import { APP_NAME } from "./config";
import {
  emptyProfile,
  formatDays,
  formatPhone,
  formatWakeTime,
  phoneDigits,
  storeProfile,
  syncProfile,
  toE164,
} from "./profile-store";

type StepId = "welcome" | "name" | "phone" | "time" | "calendar" | "priorities" | "voice" | "context" | "done";
const STEPS: StepId[] = ["welcome", "name", "phone", "time", "calendar", "priorities", "voice", "context", "done"];
const COUNTED: StepId[] = ["name", "phone", "time", "calendar", "priorities", "voice", "context"];

const CONTEXT_PROMPT =
  "Tell me everything you know about me: my goals, schedule, school, work, habits, and what I'm working on. Plain text.";

type Props = {
  initial?: Profile | null;
  onDone: (p: Profile) => void;
  onCancel?: () => void;
};

export function Onboarding({ initial, onDone, onCancel }: Props) {
  const editing = !!initial;
  const [profile, setProfile] = useState<Profile>(() => initial ?? emptyProfile());
  const [stepIdx, setStepIdx] = useState(editing ? 1 : 0);
  const [calendarChoice, setCalendarChoice] = useState<"none" | "google" | "demo">(() =>
    initial?.icalUrl ? "google" : initial ? "demo" : "none",
  );
  const step = STEPS[stepIdx];
  const counted = COUNTED.indexOf(step);
  const sun = 0.12 + 0.88 * (stepIdx / (STEPS.length - 1));

  const update = useCallback((patch: Partial<Profile>) => {
    setProfile((p) => {
      const next = { ...p, ...patch };
      storeProfile(next);
      return next;
    });
  }, []);

  const canContinue = useMemo(() => {
    switch (step) {
      case "name":
        return profile.name.trim().length > 0;
      case "phone":
        return toE164(profile.phone).length > 0;
      case "time":
        return /^\d{2}:\d{2}$/.test(profile.wakeTime) && profile.days.length > 0;
      case "voice":
        return profile.coachName.trim().length > 0;
      default:
        return true;
    }
  }, [step, profile]);

  function next() {
    if (!canContinue) return;
    storeProfile(profile);
    if (stepIdx < STEPS.length - 1) setStepIdx((i) => i + 1);
  }
  function back() {
    if (stepIdx === 0 || (editing && stepIdx === 1)) {
      onCancel?.();
      return;
    }
    setStepIdx((i) => Math.max(0, i - 1));
  }
  function finish() {
    const final: Profile = { ...profile, name: profile.name.trim(), coachName: profile.coachName.trim() || getPreset(profile.voice).defaultName };
    storeProfile(final);
    syncProfile(final);
    onDone(final);
  }

  const optional = step === "calendar" || step === "priorities" || step === "context";
  const showChrome = step !== "welcome" && step !== "done";

  return (
    <div className="sunrise flex min-h-dvh flex-col" style={{ "--sun": sun } as React.CSSProperties}>
      {/* Top bar */}
      <header className="mx-auto flex w-full max-w-[560px] items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2 sm:px-0">
        {showChrome ? (
          <>
            <button type="button" onClick={back} className="btn-text -ml-2 pl-2" aria-label="Back">
              <ArrowLeft className="size-5" aria-hidden />
              <span className="hidden sm:inline">Back</span>
            </button>
            <div className="progress flex-1" role="progressbar" aria-valuemin={1} aria-valuemax={COUNTED.length} aria-valuenow={counted + 1}>
              <span style={{ width: `${((counted + 1) / COUNTED.length) * 100}%` }} />
            </div>
            <span className="tnum shrink-0 text-sm text-[var(--muted)]">
              Step {counted + 1} of {COUNTED.length}
            </span>
          </>
        ) : (
          <div className="flex w-full items-center justify-between">
            <Wordmark size={32} />
            {onCancel && (
              <button type="button" onClick={onCancel} className="btn-text" aria-label="Close setup">
                <X className="size-5" aria-hidden />
              </button>
            )}
          </div>
        )}
      </header>

      <form
        key={step}
        className="step-enter mx-auto flex w-full max-w-[560px] flex-1 flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-0 sm:pt-10"
        onSubmit={(e) => {
          e.preventDefault();
          if (step === "done") finish();
          else next();
        }}
      >
        <div className="flex flex-1 flex-col gap-6">
          {step === "welcome" && <Welcome />}
          {step === "name" && (
            <Question title={`What should ${APP_NAME} call you?`}>
              <label htmlFor="name" className="label">
                Your first name
              </label>
              <input
                id="name"
                className="field field-lg"
                autoFocus
                autoComplete="given-name"
                maxLength={40}
                value={profile.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="RJ"
              />
            </Question>
          )}
          {step === "phone" && <PhoneStep profile={profile} update={update} />}
          {step === "time" && <TimeStep profile={profile} update={update} />}
          {step === "calendar" && (
            <CalendarStep profile={profile} update={update} choice={calendarChoice} setChoice={setCalendarChoice} onSkip={next} />
          )}
          {step === "priorities" && <PrioritiesStep profile={profile} update={update} />}
          {step === "voice" && <VoiceStep profile={profile} update={update} />}
          {step === "context" && <ContextStep profile={profile} update={update} />}
          {step === "done" && <DoneStep profile={profile} calendarChoice={calendarChoice} />}
        </div>

        {/* Bottom CTA */}
        <div className="sticky bottom-0 -mx-4 mt-6 flex flex-col items-center gap-2 bg-gradient-to-t from-black via-black/85 to-transparent px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-4 sm:static sm:mx-0 sm:bg-none sm:px-0 sm:pt-0">
          {step === "welcome" && (
            <button type="submit" className="btn-primary w-full sm:w-auto sm:min-w-72">
              Set up my mornings
            </button>
          )}
          {step !== "welcome" && step !== "done" && (
            <>
              <button type="submit" className="btn-primary w-full" disabled={!canContinue}>
                {step === "context" ? "Finish" : "Continue"}
              </button>
              {optional && (
                <button type="button" onClick={next} className="btn-text">
                  Skip for now
                </button>
              )}
            </>
          )}
          {step === "done" && (
            <>
              <button type="submit" className="btn-primary w-full text-[clamp(1.15rem,2.4vw,1.4rem)]" style={{ minHeight: 64 }}>
                Take me to my alarm
              </button>
              <p className="text-center text-sm text-[var(--muted)]">
                {profile.coachName} rings at {formatWakeTime(profile.wakeTime)}. You can also run a 10-second demo from there.
              </p>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

// ---------------- Pieces ----------------

function Question({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-[clamp(1.875rem,4vw,2.75rem)] font-bold leading-[1.05]">{title}</h1>
        {sub && <p className="text-[clamp(1rem,1.6vw,1.15rem)] leading-relaxed text-[var(--muted)]">{sub}</p>}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </>
  );
}

function Welcome() {
  return (
    <div className="flex flex-1 flex-col items-center gap-8 text-center sm:gap-10">
      <div className="fade-in flex flex-col items-center gap-5 pt-4">
        <Logo size={120} />
        <h1 className="font-display text-[clamp(2.25rem,5.5vw,3.75rem)] font-extrabold leading-[1]">
          Your mornings, <span className="brand-text">handled.</span>
        </h1>
        <p className="max-w-md text-[clamp(1.05rem,1.8vw,1.25rem)] leading-relaxed text-[var(--muted)]">
          {APP_NAME} calls you at your wake-up time, plans your day with you, and doesn&apos;t let you snooze.
        </p>
      </div>

      {/* Phone mock */}
      <div className="card fade-in-1 w-full max-w-[340px] p-5 text-left" aria-hidden>
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full" style={{ background: "var(--brand)" }}>
            <PhoneIncoming className="size-5 text-black" />
          </span>
          <div className="min-w-0">
            <p className="font-medium">{APP_NAME} · incoming call</p>
            <p className="tnum text-sm text-[var(--muted)]">7:30 AM</p>
          </div>
          <span className="ml-auto size-2.5 rounded-full bg-[var(--ok)] pulse-dot" />
        </div>
        <div className="mt-4 flex flex-col gap-2 text-[0.95rem] leading-snug">
          <p className="fade-in-1 rounded-2xl rounded-tl-sm bg-[var(--surface-2)] px-3 py-2">
            Morning, RJ. It&apos;s 7:30, 64 and clear. You awake?
          </p>
          <p className="fade-in-2 self-end rounded-2xl rounded-tr-sm px-3 py-2 text-black" style={{ background: "var(--brand)" }}>
            Give me five more minutes
          </p>
          <p className="fade-in-3 rounded-2xl rounded-tl-sm bg-[var(--surface-2)] px-3 py-2">
            Nope. Stats at 10, essay due at noon. Feet on the floor and I&apos;ll build your day.
          </p>
        </div>
      </div>
    </div>
  );
}

function PhoneStep({ profile, update }: { profile: Profile; update: (p: Partial<Profile>) => void }) {
  const [raw, setRaw] = useState(() => formatPhone(profile.phone));
  const [touched, setTouched] = useState(false);
  const valid = toE164(raw).length > 0;
  const showError = touched && !valid && raw.length > 0;
  return (
    <Question title={`Where should ${APP_NAME} call you?`} sub="We only call at your wake-up time.">
      <label htmlFor="phone" className="label">
        Mobile number (US)
      </label>
      <div className="relative">
        <Phone className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[var(--muted)]" aria-hidden />
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus
          className="field tnum pl-12 text-[1.35rem]"
          placeholder="(619) 555-0123"
          value={raw}
          aria-invalid={showError}
          aria-describedby="phone-help"
          onChange={(e) => {
            const f = formatPhone(e.target.value);
            setRaw(f);
            update({ phone: toE164(f) });
          }}
          onBlur={() => setTouched(true)}
        />
      </div>
      <p id="phone-help" className={`text-sm ${showError ? "text-[#ff8a8a]" : "text-[var(--muted)]"}`}>
        {showError ? "Enter all 10 digits, like (619) 555-0123." : `Stored as ${toE164(raw) || "+1 ..."}`}
      </p>
      {phoneDigits(raw).length === 10 && <span className="sr-only">Number looks good</span>}
    </Question>
  );
}

const PRESET_TIMES = ["06:00", "06:30", "07:00", "07:30", "08:00"];
const DAYS = [
  { d: 1, l: "M", full: "Monday" },
  { d: 2, l: "T", full: "Tuesday" },
  { d: 3, l: "W", full: "Wednesday" },
  { d: 4, l: "T", full: "Thursday" },
  { d: 5, l: "F", full: "Friday" },
  { d: 6, l: "S", full: "Saturday" },
  { d: 0, l: "S", full: "Sunday" },
];

function TimeStep({ profile, update }: { profile: Profile; update: (p: Partial<Profile>) => void }) {
  const custom = !PRESET_TIMES.includes(profile.wakeTime);
  return (
    <Question title="When do you need to be up?">
      <p className="tnum text-center font-display text-[clamp(3.5rem,14vw,6rem)] font-bold leading-none">
        {formatWakeTime(profile.wakeTime)}
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2" role="group" aria-label="Wake time">
        {PRESET_TIMES.map((t) => (
          <button
            key={t}
            type="button"
            className={`chip tnum ${profile.wakeTime === t ? "chip-on" : ""}`}
            aria-pressed={profile.wakeTime === t}
            onClick={() => update({ wakeTime: t })}
          >
            {formatWakeTime(t).replace(" AM", "")}
          </button>
        ))}
        <label className={`chip ${custom ? "chip-on" : ""} relative cursor-pointer`}>
          <span>Custom</span>
          <input
            type="time"
            aria-label="Custom wake time"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={profile.wakeTime}
            onChange={(e) => e.target.value && update({ wakeTime: e.target.value })}
          />
        </label>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <span className="label">Which days</span>
        <div className="flex justify-between gap-1.5" role="group" aria-label="Days of the week">
          {DAYS.map(({ d, l, full }) => {
            const on = profile.days.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-label={full}
                aria-pressed={on}
                className={`chip size-11 flex-1 px-0 sm:size-14 sm:text-lg ${on ? "chip-on" : ""}`}
                onClick={() => update({ days: on ? profile.days.filter((x) => x !== d) : [...profile.days, d].sort() })}
              >
                {l}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-[var(--muted)]">{formatDays(profile.days)}</p>
      </div>
    </Question>
  );
}

function CalendarStep({
  profile,
  update,
  choice,
  setChoice,
  onSkip,
}: {
  profile: Profile;
  update: (p: Partial<Profile>) => void;
  choice: "none" | "google" | "demo";
  setChoice: (c: "none" | "google" | "demo") => void;
  onSkip: () => void;
}) {
  const open = choice === "google";
  return (
    <Question title="Connect your calendar." sub={`${APP_NAME} reads today's events so the plan fits around real life.`}>
      <div className={`card ${open ? "card-selected" : "card-hover"} p-4`}>
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white">
            <CalendarDays className="size-6 text-[#1a73e8]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">Google Calendar</p>
            <p className="text-sm text-[var(--muted)]">Read-only, via your secret iCal link</p>
          </div>
          {!open ? (
            <button type="button" className="btn-ghost shrink-0 px-4 py-2 text-sm" onClick={() => setChoice("google")}>
              Connect
            </button>
          ) : (
            <span className="flex items-center gap-1 text-sm text-[var(--gold)]">
              <Check className="size-4" aria-hidden /> Selected
            </span>
          )}
        </div>
        {open && (
          <div className="fade-in mt-4 flex flex-col gap-3">
            <label htmlFor="ical" className="label">
              Secret address in iCal format
            </label>
            <input
              id="ical"
              className="field text-base"
              inputMode="url"
              autoFocus
              placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
              value={profile.icalUrl ?? ""}
              onChange={(e) => update({ icalUrl: e.target.value.trim() })}
            />
            <details className="group rounded-xl border border-[var(--line)] bg-black/40 px-4 py-3 text-sm">
              <summary className="flex list-none items-center justify-between font-medium text-[var(--muted)] [&::-webkit-details-marker]:hidden">
                Where do I find this?
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[var(--muted)]">
                <li>Open Google Calendar on the web and click the gear, then Settings.</li>
                <li>Pick your calendar on the left, under Settings for my calendars.</li>
                <li>Scroll to Integrate calendar and copy the Secret address in iCal format.</li>
              </ol>
            </details>
          </div>
        )}
      </div>
      <button
        type="button"
        className={`card ${choice === "demo" ? "card-selected" : "card-hover"} flex items-center gap-3 p-4`}
        onClick={() => {
          setChoice("demo");
          update({ icalUrl: "" });
          onSkip();
        }}
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--surface-2)]">
          <Sparkles className="size-5 text-[var(--gold)]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Use a demo calendar</p>
          <p className="text-sm text-[var(--muted)]">A sample college day: class, lunch, a deadline</p>
        </div>
      </button>
    </Question>
  );
}

type Due = Profile["priorities"][number]["due"];
const DUE: { v: Due; l: string }[] = [
  { v: "today", l: "Today" },
  { v: "tomorrow", l: "Tomorrow" },
  { v: "week", l: "This week" },
];

function PrioritiesStep({ profile, update }: { profile: Profile; update: (p: Partial<Profile>) => void }) {
  const rows = profile.priorities.length ? profile.priorities : [{ title: "", due: "today" as Due }];
  const set = (next: Profile["priorities"]) => update({ priorities: next });
  return (
    <Question title="What has to get done this week?" sub="Up to three. Your coach schedules them into the day.">
      <div className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <div key={i} className="card flex flex-col gap-3 p-3">
            <div className="flex items-center gap-2">
              <label htmlFor={`task-${i}`} className="sr-only">
                Task {i + 1}
              </label>
              <input
                id={`task-${i}`}
                className="field min-h-[48px] text-base"
                placeholder={["Finish the stats problem set", "Email Professor Lee", "Gym"][i] ?? "Task"}
                maxLength={120}
                autoFocus={i === rows.length - 1 && !row.title}
                value={row.title}
                onChange={(e) => set(rows.map((r, j) => (j === i ? { ...r, title: e.target.value } : r)))}
              />
              {rows.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove task ${i + 1}`}
                  className="btn-text size-11 shrink-0 px-0"
                  onClick={() => set(rows.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-5" aria-hidden />
                </button>
              )}
            </div>
            <div className="flex gap-2" role="group" aria-label={`Task ${i + 1} due`}>
              {DUE.map((d) => (
                <button
                  key={d.v}
                  type="button"
                  aria-pressed={row.due === d.v}
                  className={`chip flex-1 px-2 text-sm ${row.due === d.v ? "chip-on" : ""}`}
                  onClick={() => set(rows.map((r, j) => (j === i ? { ...r, due: d.v } : r)))}
                >
                  {d.l}
                </button>
              ))}
            </div>
          </div>
        ))}
        {rows.length < 3 && (
          <button type="button" className="btn-ghost self-start" onClick={() => set([...rows, { title: "", due: "today" }])}>
            <Plus className="size-4" aria-hidden /> Add another
          </button>
        )}
      </div>
    </Question>
  );
}

function VoiceStep({ profile, update }: { profile: Profile; update: (p: Partial<Profile>) => void }) {
  const [playing, setPlaying] = useState<VoicePresetId | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const a = new Audio();
    a.preload = "auto";
    a.onended = () => setPlaying(null);
    a.onpause = () => setPlaying(null);
    audioRef.current = a;
    return () => {
      a.pause();
      audioRef.current = null;
    };
  }, []);

  function toggle(id: VoicePresetId) {
    const a = audioRef.current;
    if (!a) return;
    if (playing === id) {
      a.pause();
      return;
    }
    a.src = `/voices/${id}.mp3`;
    a.currentTime = 0;
    void a.play().then(() => setPlaying(id)).catch(() => setPlaying(null));
  }

  function choose(id: VoicePresetId) {
    const preset = getPreset(id);
    const prev = getPreset(profile.voice);
    const keepName = profile.coachName && profile.coachName !== prev.defaultName;
    update({ voice: id, coachName: keepName ? profile.coachName : preset.defaultName });
  }

  return (
    <Question title="Pick your wake-up voice." sub="Tap play to hear them. This is who calls you.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Coach voice">
        {VOICE_PRESETS.map((v) => {
          const on = profile.voice === v.id;
          const isPlaying = playing === v.id;
          return (
            <div key={v.id} className={`card ${on ? "card-selected" : "card-hover"} flex items-center gap-3 p-3`}>
              <button
                type="button"
                aria-label={isPlaying ? `Pause ${v.label} sample` : `Play ${v.label} sample`}
                aria-pressed={isPlaying}
                onClick={() => toggle(v.id)}
                className="grid size-12 shrink-0 place-items-center rounded-full text-black transition-transform active:scale-95"
                style={{ background: "var(--brand)" }}
              >
                {isPlaying ? <Pause className="size-5" aria-hidden /> : <Play className="ml-0.5 size-5" aria-hidden />}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => choose(v.id)}
                className="flex min-h-[48px] min-w-0 flex-1 flex-col items-start justify-center text-left"
              >
                <span className="flex items-center gap-2 font-display text-lg font-bold">
                  {v.label}
                  {on && <Check className="size-4 text-[var(--gold)]" aria-hidden />}
                </span>
                <span className="text-sm text-[var(--muted)]">{v.tagline}</span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-col gap-2">
        <label htmlFor="coachName" className="label">
          What do you want to call them?
        </label>
        <input
          id="coachName"
          className="field text-lg"
          maxLength={24}
          value={profile.coachName}
          onChange={(e) => update({ coachName: e.target.value })}
          placeholder={getPreset(profile.voice).defaultName}
        />
      </div>
    </Question>
  );
}

type Source = "chatgpt" | "claude" | "self" | null;

function ContextStep({ profile, update }: { profile: Profile; update: (p: Partial<Profile>) => void }) {
  const [source, setSource] = useState<Source>(profile.aboutMe ? "self" : null);
  const [copied, setCopied] = useState(false);
  const coach = profile.coachName || getPreset(profile.voice).defaultName;

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(CONTEXT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the prompt is visible to copy manually */
    }
  }

  const cards: { id: Exclude<Source, null>; label: string; sub: string; icon: React.ReactNode }[] = [
    { id: "chatgpt", label: "ChatGPT", sub: "Paste what it knows", icon: <MessageSquare className="size-5" aria-hidden /> },
    { id: "claude", label: "Claude", sub: "Paste what it knows", icon: <Sparkles className="size-5" aria-hidden /> },
    { id: "self", label: "Write it yourself", sub: "A few lines is plenty", icon: <PenLine className="size-5" aria-hidden /> },
  ];

  return (
    <Question title={`Give ${coach} the backstory.`} sub="It's a paste, not a login. Nothing leaves your device until the call.">
      <div className="grid grid-cols-3 gap-2 sm:gap-3" role="radiogroup" aria-label="Where your context comes from">
        {cards.map((c) => {
          const on = source === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setSource(c.id)}
              className={`card ${on ? "card-selected" : "card-hover"} flex min-h-[96px] flex-col items-start justify-between gap-2 p-3`}
            >
              <span className={`grid size-9 place-items-center rounded-lg ${on ? "text-black" : "bg-[var(--surface-2)] text-[var(--gold)]"}`} style={on ? { background: "var(--brand)" } : undefined}>
                {c.icon}
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-medium leading-tight sm:text-base">{c.label}</span>
                <span className="hidden text-xs text-[var(--muted)] sm:block">{c.sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      {(source === "chatgpt" || source === "claude") && (
        <div className="card fade-in flex flex-col gap-3 p-4">
          <p className="text-sm font-medium">
            <span className="tnum mr-2 inline-grid size-6 place-items-center rounded-full bg-[var(--surface-2)] text-xs">1</span>
            Copy this prompt and send it to {source === "chatgpt" ? "ChatGPT" : "Claude"}
          </p>
          <div className="flex items-start gap-2 rounded-xl bg-black/50 p-3">
            <p className="flex-1 text-sm leading-relaxed text-[var(--muted)]">{CONTEXT_PROMPT}</p>
            <button type="button" onClick={copyPrompt} className="btn-ghost shrink-0 px-3 py-2 text-sm" aria-live="polite">
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-sm font-medium">
            <span className="tnum mr-2 inline-grid size-6 place-items-center rounded-full bg-[var(--surface-2)] text-xs">2</span>
            Paste the answer below
          </p>
        </div>
      )}

      {source && (
        <div className="fade-in flex flex-col gap-2">
          <label htmlFor="aboutMe" className="label">
            About you
          </label>
          <textarea
            id="aboutMe"
            className="field min-h-[140px] resize-y text-base leading-relaxed sm:min-h-[180px]"
            maxLength={4000}
            autoFocus
            placeholder={
              source === "self"
                ? "Junior at SDSU, marketing major. 8 AM stats on Mon/Wed. Working on a hackathon app. Trying to hit the gym before class."
                : "Paste the answer here"
            }
            value={profile.aboutMe}
            onChange={(e) => update({ aboutMe: e.target.value })}
          />
          <p className="tnum text-right text-xs text-[var(--muted)]">{profile.aboutMe.length} / 4000</p>
        </div>
      )}
    </Question>
  );
}

function DoneStep({ profile, calendarChoice }: { profile: Profile; calendarChoice: "none" | "google" | "demo" }) {
  const preset = getPreset(profile.voice);
  const rows: [string, string][] = [
    ["Calls", formatPhone(profile.phone) || "Not set"],
    ["Wake time", `${formatWakeTime(profile.wakeTime)} · ${formatDays(profile.days)}`],
    ["Calendar", calendarChoice === "google" && profile.icalUrl ? "Google Calendar connected" : "Demo calendar"],
    ["Priorities", profile.priorities.filter((p) => p.title.trim()).length ? `${profile.priorities.filter((p) => p.title.trim()).length} this week` : "None yet"],
    ["Coach", `${profile.coachName || preset.defaultName} · ${preset.label} voice`],
  ];
  return (
    <div className="rise flex flex-col items-center gap-6 text-center">
      <Logo size={96} />
      <div>
        <h1 className="font-display text-[clamp(2.25rem,5vw,3.5rem)] font-extrabold leading-[1.05]">
          You&apos;re set, <span className="brand-text">{profile.name.trim()}.</span>
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          {profile.coachName || preset.defaultName} will get you up and build your day with you.
        </p>
      </div>
      <dl className="card w-full divide-y divide-[var(--line)] text-left">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-[var(--muted)]">{k}</dt>
            <dd className={`text-right font-medium ${k === "Wake time" || k === "Calls" ? "tnum" : ""}`}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
