"use client";
import { useEffect, useRef } from "react";

type Props = {
  active: boolean;
  speaking: boolean;
  /** Planner is running (build_plan in flight): the orb breathes faster so status never goes blank. */
  planning?: boolean;
  getInputVolume: () => number;
  getOutputVolume: () => number;
};

/** Brand-gradient orb that breathes and reacts to agent (output) or user (input) volume. Writes styles directly; no re-renders. */
export function VoiceOrb({ active, speaking, planning = false, getInputVolume, getOutputVolume }: Props) {
  const coreRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;
  const planningRef = useRef(planning);
  planningRef.current = planning;
  const fnRef = useRef({ getInputVolume, getOutputVolume });
  fnRef.current = { getInputVolume, getOutputVolume };

  useEffect(() => {
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let level = 0;
    // One continuous phase accumulator: changing breath rate (listening <-> planning) never jumps.
    let last = 0;
    let ph = 0;
    let amp = 0.03;
    const tick = (t: number) => {
      const dt = last ? Math.min(64, t - last) : 16;
      last = t;
      let v = 0;
      if (active) {
        try {
          v = speakingRef.current ? fnRef.current.getOutputVolume() : fnRef.current.getInputVolume();
        } catch {
          v = 0;
        }
      }
      if (!Number.isFinite(v)) v = 0;
      v = Math.min(1, Math.max(0, v));
      level += (v - level) * 0.25;
      const thinking = planningRef.current && !speakingRef.current;
      ph += dt / (thinking ? 380 : 700);
      amp += ((thinking ? 0.05 : 0.03) - amp) * 0.05;
      const breathe = reduce ? 0 : amp * Math.sin(ph);
      const scale = 1 + breathe + level * 0.4;
      if (coreRef.current) coreRef.current.style.transform = `scale(${scale.toFixed(3)})`;
      if (haloRef.current) {
        haloRef.current.style.transform = `scale(${(1.1 + level * 0.8 + (thinking ? 0.1 : 0)).toFixed(3)})`;
        haloRef.current.style.opacity = (0.3 + level * 0.55).toFixed(3);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const state = speaking ? "orb-speaking" : planning ? "orb-planning" : active ? "orb-listening" : "orb-idle";

  return (
    <div className="relative grid size-[clamp(8rem,28vw,12rem)] place-items-center" aria-hidden>
      <div
        ref={haloRef}
        className="absolute inset-0 rounded-full blur-2xl"
        style={{ background: "radial-gradient(circle, #ffa000 0%, #ff6a00 60%, transparent 75%)", transition: "opacity 400ms ease" }}
      />
      <div
        ref={coreRef}
        className={`orb-core relative size-full rounded-full ${state}`}
        style={{ boxShadow: "inset 0 -18px 40px rgba(0,0,0,.35), inset 0 10px 30px rgba(255,255,255,.25), var(--glow)" }}
      />
    </div>
  );
}
