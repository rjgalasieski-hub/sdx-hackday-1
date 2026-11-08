"use client";

import type { Profile } from "@/lib/profile";
import { PlanCard, usePlanTools, warmPlanner } from "./planTools";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import type { ConnectionType, DisconnectionDetails, MessagePayload } from "@elevenlabs/react";
import { AlarmClock, Mic, MicOff, Settings2, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlarmSound, createAudioContext, unlockAudio } from "./alarm-sound";
import { haptic } from "./haptics";
import {
  fallbackBriefing,
  fetchBriefing,
  fetchDetails,
  toDynamicVariables,
  type Briefing,
  type BriefingResult,
  type Details,
} from "./briefing";
import { BriefingCards } from "./BriefingCards";
import { Clock } from "./Clock";
import { AGENT_ID, APP_NAME, DEMO_DELAY_MS } from "./config";
import { Logo, Wordmark } from "./Logo";
import { Onboarding } from "./Onboarding";
import { Settings } from "./Settings";
import { formatDays, formatWakeTime, isComplete, loadProfile } from "./profile-store";
import { formatTimeShort, useNow } from "./useNow";
import { VoiceOrb } from "./VoiceOrb";

type Phase = "idle" | "armed" | "ringing" | "talking" | "done";
type MicState = "unknown" | "asking" | "granted" | "denied" | "unsupported";

const MISSING_AGENT_MSG =
  "No ElevenLabs agent ID. Add NEXT_PUBLIC_ELEVENLABS_AGENT_ID to web/.env.local and restart the dev server.";

function nextOccurrence(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function friendlyError(raw: string | undefined): string {
  const msg = raw ?? "Something went wrong.";
  if (/permission|notallowed|denied|microphone|getusermedia/i.test(msg)) {
    return "Microphone is blocked. Allow mic access from the icon in the address bar, then tap Try again.";
  }
  if (/token|agent|404|401|403/i.test(msg)) {
    return `Couldn't reach the ElevenLabs agent. Check the agent ID and that the agent is public. (${msg})`;
  }
  return msg;
}

/** Gate: first visit (no saved setup) runs onboarding; after that the alarm app. */
export default function WakeApp() {
  const [mounted, setMounted] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState(false);
  // Settings slides in from the right (its button lives top-right); coming Back, Home returns from the left.
  const [fromSettings, setFromSettings] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="grid min-h-dvh place-items-center bg-black">
        <Logo size={88} />
      </div>
    );
  }

  if (!isComplete(profile) || editing) {
    return (
      <Onboarding
        key={editing ? "edit" : "first"}
        initial={editing ? profile : null}
        onDone={(p) => {
          setProfile(p);
          setEditing(false);
          setFromSettings(false);
        }}
        onCancel={editing ? () => setEditing(false) : undefined}
      />
    );
  }

  if (settings) {
    return (
      <Settings
        initial={profile}
        onBack={(p) => {
          setProfile(p);
          setSettings(false);
          setFromSettings(true);
        }}
        onReset={() => {
          // Demo reset: storage is already wiped; dropping the profile re-runs first-time onboarding.
          setSettings(false);
          setEditing(false);
          setProfile(null);
        }}
      />
    );
  }

  return (
    <ConversationProvider>
      <WakeInner profile={profile} onEdit={() => setSettings(true)} enterClass={fromSettings ? "screen-enter-back" : ""} />
    </ConversationProvider>
  );
}

function WakeInner({ profile, onEdit, enterClass = "" }: { profile: Profile; onEdit: () => void; enterClass?: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [alarmAt, setAlarmAt] = useState<number | null>(null);
  const [mic, setMic] = useState<MicState>("unknown");
  const [audioWarning, setAudioWarning] = useState<string | null>(null);

  const [briefing, setBriefing] = useState<Briefing>(() => fallbackBriefing());
  const [usingFallback, setUsingFallback] = useState(false);
  const [details, setDetails] = useState<Details>({});
  const [preparing, setPreparing] = useState(false);
  const [convError, setConvError] = useState<string | null>(null);
  const [lastLine, setLastLine] = useState<{ role: "user" | "agent"; text: string } | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const alarmRef = useRef<AlarmSound | null>(null);
  const briefingPromiseRef = useRef<Promise<BriefingResult> | null>(null);
  const briefingResultRef = useRef<BriefingResult | null>(null);
  const connectionTypeRef = useRef<ConnectionType>("webrtc");
  const connectedOnceRef = useRef(false);
  const retriedRef = useRef(false);
  const dynVarsRef = useRef<Record<string, string>>({});
  const endedByUserRef = useRef(false);

  const coachName = profile.coachName || briefing.coach_name || APP_NAME;

  const planTools = usePlanTools();
  const conversation = useConversation({
    onConnect: () => {
      connectedOnceRef.current = true;
      setConvError(null);
    },
    onDisconnect: (details: DisconnectionDetails) => {
      if (endedByUserRef.current) return;
      if (details.reason === "agent") {
        setPhase("done");
      } else if (details.reason === "error" && connectedOnceRef.current) {
        setConvError(friendlyError(details.message));
      }
    },
    onError: (message: string) => {
      console.warn("[elevenlabs] error:", message);
      if (endedByUserRef.current) return;
      // WebRTC can fail on locked-down networks. Retry once over WebSocket before showing an error.
      if (
        !connectedOnceRef.current &&
        connectionTypeRef.current === "webrtc" &&
        !retriedRef.current
      ) {
        retriedRef.current = true;
        connectionTypeRef.current = "websocket";
        setTimeout(() => startConversation(), 400);
        return;
      }
      setConvError(friendlyError(message));
    },
    onMessage: (msg: MessagePayload) => {
      if (msg.message?.trim()) setLastLine({ role: msg.role, text: msg.message });
    },
  });
  const { startSession, endSession, status, isSpeaking } = conversation;

  // ---- ElevenLabs session ----

  // Client tool: the coach can grant a snooze (after pushing back). Ends the call a few seconds
  // later, so the goodbye line finishes, and re-arms the alarm. Capped at 10 minutes.
  function snoozeTool(params: { minutes?: number }) {
    const minutes = Math.min(10, Math.max(1, Math.round(Number(params?.minutes) || 5)));
    const at = Date.now() + minutes * 60_000;
    setTimeout(() => {
      endedByUserRef.current = true;
      endSession();
      setLastLine(null);
      setAlarmAt(at);
      setPhase("armed");
    }, 5000);
    const time = new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `Snooze set for ${minutes} minutes. The alarm rings again at ${time}. Say one short goodbye line in your personality; the call ends in a few seconds.`;
  }

  // Per-user voice, plus Spanish when the profile asks for it (agent allows these overrides).
  function sessionOverrides(vars: Record<string, string> | undefined) {
    const voiceId = vars?.voice_id ? String(vars.voice_id) : undefined;
    if (vars?.language === "es") {
      return {
        tts: { voiceId, modelId: "eleven_flash_v2_5" as const },
        agent: {
          language: "es" as const,
          firstMessage: "¡Buenos días, {{name}}! Soy {{coach_name}}. ¿Ya estás despierto o necesitas un segundo?",
        },
      };
    }
    return voiceId ? { tts: { voiceId } } : undefined;
  }

  function startConversation() {
    startSession({
      agentId: AGENT_ID,
      connectionType: connectionTypeRef.current,
      dynamicVariables: dynVarsRef.current,
      clientTools: { ...planTools.clientTools, snooze: snoozeTool },
      overrides: sessionOverrides(dynVarsRef.current),
    });
  }

  function beginConversation(b: Briefing) {
    if (!AGENT_ID) {
      setConvError(MISSING_AGENT_MSG);
      return;
    }
    const forceWs =
      typeof window !== "undefined" && new URLSearchParams(window.location.search).has("ws");
    connectionTypeRef.current = forceWs ? "websocket" : "webrtc";
    connectedOnceRef.current = false;
    retriedRef.current = false;
    endedByUserRef.current = false;
    dynVarsRef.current = toDynamicVariables(b);
    setConvError(null);
    setLastLine(null);
    startConversation();
  }

  // ---- Alarm ----

  const loadBriefing = useCallback(() => {
    briefingResultRef.current = null;
    const p = fetchBriefing().then((r) => {
      briefingResultRef.current = r;
      setBriefing(r.briefing);
      setUsingFallback(r.fromFallback);
      return r;
    });
    briefingPromiseRef.current = p;
    void fetchDetails().then(setDetails);
    return p;
  }, []);

  const ring = useCallback(() => {
    setPhase("ringing");
    setAlarmAt(null);
    let ctx = audioCtxRef.current;
    if (!ctx) {
      ctx = createAudioContext();
      audioCtxRef.current = ctx;
    }
    if (ctx) {
      alarmRef.current ??= new AlarmSound(ctx);
      alarmRef.current.start();
      if (ctx.state !== "running") {
        setAudioWarning("Browser blocked the alarm sound. Tap anywhere to unmute.");
      }
    }
    // Prefetch so "I'm up" can start the conversation instantly, and wake the Daytona sandbox.
    void loadBriefing();
    warmPlanner();
  }, [loadBriefing]);

  async function requestMic() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMic("unsupported");
      return;
    }
    setMic("asking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // We only need the permission grant; the SDK opens its own stream later.
      stream.getTracks().forEach((t) => t.stop());
      setMic("granted");
    } catch (err) {
      console.warn("[mic]", err);
      setMic("denied");
    }
  }

  function arm(at: number) {
    // Must run inside the click so the browser lets us play audio later.
    let ctx = audioCtxRef.current;
    if (!ctx) {
      ctx = createAudioContext();
      audioCtxRef.current = ctx;
    }
    if (ctx) {
      unlockAudio(ctx);
      setAudioWarning(null);
    } else {
      setAudioWarning("This browser has no Web Audio support, so the alarm will be silent.");
    }
    setAlarmAt(at);
    setPhase("armed");
    if (mic !== "granted") void requestMic();
  }

  function onSetAlarm() {
    const at = nextOccurrence(profile.wakeTime);
    if (at) arm(at);
  }

  function onDemo() {
    arm(Date.now() + DEMO_DELAY_MS);
  }

  function cancelAlarm() {
    setAlarmAt(null);
    setPhase("idle");
  }

  // Bedside mode: while an alarm is armed, keep the screen awake so the page (and its timer) isn't
  // suspended. Re-acquired when the page becomes visible again; silently skipped where unsupported.
  useEffect(() => {
    if (phase !== "armed") return;
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };
    let lock: Sentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        if (!nav.wakeLock || document.visibilityState !== "visible") return;
        const l = await nav.wakeLock.request("screen");
        if (cancelled) void l.release();
        else lock = l;
      } catch {
        // Not supported or not allowed (e.g. low battery mode); the alarm still works while the screen is on.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [phase]);

  // Alarm watcher.
  useEffect(() => {
    if (phase !== "armed" || alarmAt === null) return;
    const id = setInterval(() => {
      if (Date.now() >= alarmAt) ring();
    }, 200);
    return () => clearInterval(id);
  }, [phase, alarmAt, ring]);

  // Stop sound on unmount.
  useEffect(() => () => alarmRef.current?.stop(), []);

  // Snooze set: the only talking -> armed path. One tap on the same frame the armed card appears.
  const prevPhaseRef = useRef<Phase>(phase);
  useEffect(() => {
    if (prevPhaseRef.current === "talking" && phase === "armed") haptic();
    prevPhaseRef.current = phase;
  }, [phase]);

  async function wakeUp() {
    alarmRef.current?.stop();
    void audioCtxRef.current?.resume();
    setAudioWarning(null);
    setPhase("talking");
    if (!AGENT_ID) {
      setConvError(MISSING_AGENT_MSG);
      return;
    }
    // If the prefetch already landed, start right inside the click (best for strict autoplay rules).
    const ready = briefingResultRef.current;
    if (ready) {
      beginConversation(ready.briefing);
      return;
    }
    setPreparing(true);
    const r = await (briefingPromiseRef.current ?? loadBriefing());
    setPreparing(false);
    beginConversation(r.briefing);
  }

  function endTalk() {
    endedByUserRef.current = true;
    endSession();
    setPhase("done");
  }

  function retry() {
    endedByUserRef.current = true;
    endSession();
    setTimeout(() => beginConversation(briefing), 300);
  }

  function reset() {
    endedByUserRef.current = true;
    endSession();
    setConvError(null);
    setLastLine(null);
    planTools.reset();
    setPhase("idle");
  }

  // ---- Render ----

  if (phase === "ringing") {
    return (
      <Ringing
        coachName={coachName}
        onWake={wakeUp}
        warning={audioWarning}
        onUnmute={() => {
          void audioCtxRef.current?.resume();
          setAudioWarning(null);
        }}
      />
    );
  }

  if (phase === "talking") {
    const live = status === "connected" && !convError;
    const planning = planTools.planning;
    // Status is never blank: speaking > planning > listening while connected.
    const label = convError
      ? "Not connected"
      : preparing
        ? "Pulling your morning together"
        : status === "connected"
          ? isSpeaking
            ? "Speaking"
            : planning
              ? "Planning"
              : "Listening"
          : status === "error"
            ? "Not connected"
            : "Connecting";
    const subline = live ? (isSpeaking ? "Speaking" : planning ? "Planning your day" : "Listening, go ahead and talk") : label;
    const hasPlan = !!planTools.plan || planning;
    return (
      <Screen sun={0.7}>
        <Header sticky right={<StatusPill label={label} live={live} speaking={live && isSpeaking} planning={live && planning} />} />
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-6 px-4 pb-10 pt-2 sm:px-8">
          <div className={`flex flex-col items-center gap-4 ${hasPlan ? "pt-0" : "pt-4"}`}>
            <VoiceOrb
              active={status === "connected"}
              speaking={status === "connected" && isSpeaking}
              planning={status === "connected" && planning}
              getInputVolume={conversation.getInputVolume}
              getOutputVolume={conversation.getOutputVolume}
            />
            <div className="text-center">
              <p className="font-display text-[clamp(1.5rem,3.5vw,2.25rem)] font-bold leading-tight">{coachName}</p>
              <p className="text-[var(--muted)]">
                <span key={subline} className="fade-in-fast inline-block">
                  {subline}
                </span>
              </p>
            </div>
            {lastLine && !convError && (
              <p
                className="max-w-3xl text-center text-[clamp(1.1rem,2.2vw,1.5rem)] leading-snug"
                aria-live="polite"
              >
                <span className="mr-2 text-xs uppercase tracking-[0.18em] text-[var(--gold)]">
                  {lastLine.role === "agent" ? coachName : "You"}
                </span>
                {lastLine.text.length > 220 ? `${lastLine.text.slice(0, 220)}…` : lastLine.text}
              </p>
            )}
          </div>

          {convError && (
            <ErrorBox message={convError}>
              {AGENT_ID && (
                <button onClick={retry} className="btn-primary">
                  Try again
                </button>
              )}
              <button onClick={reset} className="btn-ghost">
                Back
              </button>
            </ErrorBox>
          )}

          <PlanCard plan={planTools.plan} planning={planTools.planning} />
          <BriefingCards briefing={briefing} details={details} />
          {usingFallback && (
            <p className="text-sm text-[var(--muted)]">Showing sample data (couldn&apos;t load /api/briefing).</p>
          )}

          <button onClick={endTalk} className="btn-end">
            End
          </button>
        </main>
      </Screen>
    );
  }

  if (phase === "done") {
    return (
      <Screen sun={1}>
        <Header />
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-4 pb-12 text-center">
          <div className="rise flex flex-col items-center gap-5">
            <Logo size={120} />
            <h2 className="font-display text-[clamp(2.75rem,7vw,5rem)] font-extrabold leading-none">
              You&apos;re <span className="brand-text">up.</span>
            </h2>
            <p className="text-[clamp(1.1rem,2.2vw,1.4rem)] text-[var(--muted)]">
              {planTools.plan?.locked ? "Your day is locked. Go get it." : "Go have a great day."}
            </p>
          </div>
          <PlanCard plan={planTools.plan} planning={false} />
          <button onClick={reset} className="btn-primary">
            Set tomorrow&apos;s alarm
          </button>
        </main>
      </Screen>
    );
  }

  // idle + armed = Home
  return (
    <Screen sun={phase === "armed" ? 0.5 : 0.3} className={enterClass}>
      <Header
        right={
          <button onClick={onEdit} className="btn-text" aria-label="Settings">
            <Settings2 className="size-5" aria-hidden />
            <span className="hidden sm:inline">Settings</span>
          </button>
        }
      />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-8 px-4 pb-10 text-center">
        <div className="fade-in flex flex-col items-center gap-4">
          <Logo size={128} pulse={phase === "armed"} />
          <div>
            <h1 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-bold leading-tight">
              {phase === "armed" ? `${coachName} is on it.` : `Morning, ${profile.name}.`}
            </h1>
            <p className="mt-1 text-[var(--muted)]">
              {phase === "armed" ? "Leave this open. Sound is unlocked." : `${coachName} calls at your wake time.`}
            </p>
          </div>
        </div>

        {!AGENT_ID && <ErrorBox message={MISSING_AGENT_MSG} />}

        {phase === "armed" && alarmAt !== null ? (
          <Armed alarmAt={alarmAt} onCancel={cancelAlarm} onRingNow={ring} />
        ) : (
          <div className="flex w-full flex-col items-center gap-3">
            <div className="card flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
              <div>
                <p className="label">Next wake-up</p>
                <p className="tnum font-display text-[clamp(2.25rem,8vw,3rem)] font-bold leading-none">
                  {formatWakeTime(profile.wakeTime)}
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">{formatDays(profile.days)}</p>
              </div>
              <AlarmClock className="size-9 text-[var(--gold)]" aria-hidden />
            </div>
            <button onClick={onSetAlarm} className="btn-primary w-full" style={{ minHeight: 60 }}>
              Set my alarm
            </button>
            <button onClick={onDemo} className="btn-ghost w-full">
              <Zap className="size-4 text-[var(--gold)]" aria-hidden />
              Demo: ring in {Math.round(DEMO_DELAY_MS / 1000)} seconds
            </button>
            <button onClick={onEdit} className="btn-text sm:hidden">
              Edit setup
            </button>
          </div>
        )}

        <MicNote mic={mic} />
        {audioWarning && <p className="text-[var(--warn)]">{audioWarning}</p>}
      </main>
    </Screen>
  );
}

// ---- Pieces ----

function Screen({ children, sun = 0.3, className = "" }: { children: React.ReactNode; sun?: number; className?: string }) {
  return (
    <div className={`sunrise flex min-h-dvh flex-col ${className}`} style={{ "--sun": sun } as React.CSSProperties}>
      {children}
    </div>
  );
}

/** `sticky` turns the bar translucent and pins it; only used where content scrolls under it (talking screen). */
function Header({ right, sticky = false }: { right?: React.ReactNode; sticky?: boolean }) {
  return (
    <header className={`${sticky ? "glass-bar" : ""} flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 sm:px-8`}>
      <Wordmark size={32} />
      {right}
    </header>
  );
}

function StatusPill({ label, live, speaking, planning = false }: { label: string; live: boolean; speaking: boolean; planning?: boolean }) {
  const dot = !live ? "var(--faint)" : speaking ? "var(--amber)" : planning ? "var(--gold)" : "var(--ok)";
  return (
    <div className="flex items-center gap-2 rounded-full border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 py-2 text-sm">
      <span className={`size-2.5 rounded-full ${live ? "pulse-dot" : ""}`} style={{ background: dot, transition: "background 300ms ease" }} />
      <span key={label} className="fade-in-fast inline-block">
        {label}
      </span>
    </div>
  );
}

function ErrorBox({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex w-full max-w-2xl flex-col items-center gap-4 rounded-2xl border border-[rgba(255,120,120,.4)] bg-[rgba(255,80,80,.1)] px-6 py-5 text-center text-[clamp(1rem,1.8vw,1.15rem)]"
    >
      <p>{message}</p>
      {children && <div className="flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  );
}

function MicNote({ mic }: { mic: MicState }) {
  if (mic === "denied") {
    return (
      <p className="flex max-w-md items-center gap-2 text-[var(--warn)]">
        <MicOff className="size-4 shrink-0" aria-hidden />
        Microphone blocked. Allow it from the address bar so you can talk to your coach.
      </p>
    );
  }
  if (mic === "unsupported") {
    return (
      <p className="max-w-md text-[var(--warn)]">No microphone access here. Open the app on localhost or over HTTPS.</p>
    );
  }
  if (mic === "granted")
    return (
      <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
        <Mic className="size-4 text-[var(--ok)]" aria-hidden /> Mic ready
      </p>
    );
  if (mic === "asking") return <p className="text-sm text-[var(--muted)]">Allow the microphone so you can talk in the morning</p>;
  return null;
}

function Armed({
  alarmAt,
  onCancel,
  onRingNow,
}: {
  alarmAt: number;
  onCancel: () => void;
  onRingNow: () => void;
}) {
  const now = useNow();
  const remaining = Math.max(0, Math.ceil((alarmAt - (now?.getTime() ?? Date.now())) / 1000));
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  const countdown = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="card card-selected w-full px-6 py-5" style={{ boxShadow: "var(--glow)" }}>
        <p className="label">Alarm set</p>
        <p className="tnum font-display text-[clamp(2.5rem,9vw,3.5rem)] font-bold leading-none">
          {formatTimeShort(new Date(alarmAt))}
        </p>
        <p className="tnum mt-2 text-[var(--muted)]">Rings in {countdown}</p>
      </div>
      <div className="flex w-full gap-3">
        <button onClick={onCancel} className="btn-ghost flex-1">
          Cancel
        </button>
        <button onClick={onRingNow} className="btn-ghost flex-1">
          Ring now
        </button>
      </div>
    </div>
  );
}

function Ringing({
  coachName,
  onWake,
  warning,
  onUnmute,
}: {
  coachName: string;
  onWake: () => void;
  warning: string | null;
  onUnmute: () => void;
}) {
  return (
    <div
      className="sunrise flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-10 text-center sm:gap-10"
      style={{ "--sun": 1 } as React.CSSProperties}
      onClick={warning ? onUnmute : undefined}
    >
      <Logo size={168} pulse />
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm font-medium uppercase tracking-[0.3em] text-[var(--gold)]">{coachName} is calling</p>
        <Clock size="lg" />
      </div>
      <button
        onClick={() => {
          haptic();
          onWake();
        }}
        className="btn-wake font-display"
      >
        I&apos;m up
      </button>
      {warning && <p className="text-lg text-[var(--muted)]">{warning}</p>}
    </div>
  );
}
