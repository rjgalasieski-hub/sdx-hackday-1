"use client";

import { PlanCard, usePlanTools, warmPlanner } from "./planTools";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import type { ConnectionType, DisconnectionDetails, MessagePayload } from "@elevenlabs/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlarmSound, createAudioContext, unlockAudio } from "./alarm-sound";
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
import { AGENT_ID, APP_NAME, APP_TAGLINE, DEMO_DELAY_MS } from "./config";
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

export default function WakeApp() {
  return (
    <ConversationProvider>
      <WakeInner />
    </ConversationProvider>
  );
}

function WakeInner() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [alarmTime, setAlarmTime] = useState("07:00");
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

  function startConversation() {
    startSession({
      agentId: AGENT_ID,
      connectionType: connectionTypeRef.current,
      dynamicVariables: dynVarsRef.current,
      clientTools: planTools.clientTools,
      overrides: dynVarsRef.current?.voice_id ? { tts: { voiceId: String(dynVarsRef.current.voice_id) } } : undefined,
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
    const at = nextOccurrence(alarmTime);
    if (at) arm(at);
  }

  function onDemo() {
    arm(Date.now() + DEMO_DELAY_MS);
  }

  function cancelAlarm() {
    setAlarmAt(null);
    setPhase("idle");
  }

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
    const label = convError
      ? "Not connected"
      : preparing
        ? "Pulling your morning together"
        : status === "connected"
          ? isSpeaking
            ? "Speaking"
            : "Listening, go ahead and talk"
          : status === "error"
            ? "Not connected"
            : "Connecting";
    return (
      <Screen>
        <Header right={<StatusPill label={label} live={status === "connected" && !convError} />} />
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center gap-8 px-4 pb-10 pt-2 sm:px-8">
          <div className="flex flex-col items-center gap-5 pt-2">
            <VoiceOrb
              active={status === "connected"}
              speaking={status === "connected" && isSpeaking}
              getInputVolume={conversation.getInputVolume}
              getOutputVolume={conversation.getOutputVolume}
            />
            <h2 className="text-center text-[clamp(1.75rem,4.5vw,3rem)] font-light">
              Good morning{briefing.name && briefing.name !== "there" ? `, ${briefing.name}` : ""}.
            </h2>
            <p className="text-center text-[clamp(1rem,2vw,1.35rem)] text-[var(--muted)]">
              {briefing.date}
            </p>
            {lastLine && !convError && (
              <p
                className="max-w-3xl text-center text-[clamp(1.05rem,2.2vw,1.5rem)] leading-snug text-[var(--soft)]"
                aria-live="polite"
              >
                <span className="mr-2 text-sm uppercase tracking-[0.18em] text-[var(--muted)]">
                  {lastLine.role === "agent" ? APP_NAME : "You"}
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
            <p className="text-sm text-[var(--muted)]">
              Showing sample data (couldn&apos;t load /api/briefing).
            </p>
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
      <Screen>
        <Header />
        <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 text-center">
          <div className="sun-rise" aria-hidden />
          <h2 className="text-[clamp(2.5rem,7vw,5rem)] font-extralight">You&apos;re up.</h2>
          <p className="text-[clamp(1.1rem,2.4vw,1.6rem)] text-[var(--muted)]">Go have a great day.</p>
          <PlanCard plan={planTools.plan} planning={false} />
          <button onClick={reset} className="btn-primary">
            Set another alarm
          </button>
        </main>
      </Screen>
    );
  }

  // idle + armed
  return (
    <Screen>
      <Header />
      <main className="flex flex-1 flex-col items-center justify-center gap-10 px-4 pb-12 text-center">
        <Clock />

        {!AGENT_ID && <ErrorBox message={MISSING_AGENT_MSG} />}

        {phase === "armed" && alarmAt !== null ? (
          <Armed alarmAt={alarmAt} onCancel={cancelAlarm} onRingNow={ring} />
        ) : (
          <div className="flex w-full max-w-md flex-col items-center gap-4">
            <label htmlFor="alarm" className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">
              Wake me at
            </label>
            <input
              id="alarm"
              type="time"
              value={alarmTime}
              onChange={(e) => setAlarmTime(e.target.value)}
              className="time-input"
            />
            <button onClick={onSetAlarm} className="btn-primary w-full">
              Set alarm
            </button>
            <button onClick={onDemo} className="btn-ghost w-full">
              Demo: ring in {Math.round(DEMO_DELAY_MS / 1000)} seconds
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

function Screen({ children }: { children: React.ReactNode }) {
  return <div className="sky-bg flex min-h-dvh flex-col">{children}</div>;
}

function Header({ right }: { right?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between px-5 py-5 sm:px-8">
      <div className="flex items-center gap-3">
        <span className="logo-dot" aria-hidden />
        <span className="text-xl font-medium tracking-wide">{APP_NAME}</span>
        <span className="hidden text-[var(--muted)] sm:inline">{APP_TAGLINE}</span>
      </div>
      {right}
    </header>
  );
}

function StatusPill({ label, live }: { label: string; live: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-sm sm:text-base">
      <span className={`size-2.5 rounded-full ${live ? "bg-[var(--ok)] pulse-dot" : "bg-[var(--muted)]"}`} />
      {label}
    </div>
  );
}

function ErrorBox({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex w-full max-w-2xl flex-col items-center gap-4 rounded-3xl border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-6 py-5 text-center text-[clamp(1rem,1.8vw,1.2rem)]"
    >
      <p>{message}</p>
      {children && <div className="flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  );
}

function MicNote({ mic }: { mic: MicState }) {
  if (mic === "denied") {
    return (
      <p className="max-w-md text-[var(--warn)]">
        Microphone blocked. Allow it from the address bar so you can talk to {APP_NAME}.
      </p>
    );
  }
  if (mic === "unsupported") {
    return (
      <p className="max-w-md text-[var(--warn)]">
        No microphone access here. Open the app on localhost or over HTTPS.
      </p>
    );
  }
  if (mic === "granted") return <p className="text-sm text-[var(--muted)]">Mic ready</p>;
  if (mic === "asking") return <p className="text-sm text-[var(--muted)]">Allow the microphone so we can talk in the morning</p>;
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
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <div className="rounded-3xl border border-[var(--line)] bg-[var(--card)] px-8 py-6">
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">Alarm set</p>
        <p className="mt-1 text-[clamp(2rem,6vw,3rem)] font-light tabular-nums">
          {formatTimeShort(new Date(alarmAt))}
        </p>
        <p className="mt-1 text-[var(--muted)] tabular-nums">Rings in {countdown}</p>
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
  onWake,
  warning,
  onUnmute,
}: {
  onWake: () => void;
  warning: string | null;
  onUnmute: () => void;
}) {
  return (
    <div
      className="ring-bg flex min-h-dvh flex-col items-center justify-center gap-10 px-4 text-center"
      onClick={warning ? onUnmute : undefined}
    >
      <p className="ring-label text-[clamp(1.1rem,3vw,1.75rem)] font-medium uppercase tracking-[0.35em]">
        Wake up
      </p>
      <Clock size="lg" />
      <button onClick={onWake} className="btn-wake">
        I&apos;m up
      </button>
      {warning && <p className="text-lg">{warning}</p>}
    </div>
  );
}
