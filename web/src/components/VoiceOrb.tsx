"use client";
import { useEffect, useRef } from "react";

type Props = {
  active: boolean;
  speaking: boolean;
  getInputVolume: () => number;
  getOutputVolume: () => number;
};

/** Breathing orb that reacts to agent (output) or user (input) volume. Writes styles directly; no re-renders. */
export function VoiceOrb({ active, speaking, getInputVolume, getOutputVolume }: Props) {
  const coreRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;
  const fnRef = useRef({ getInputVolume, getOutputVolume });
  fnRef.current = { getInputVolume, getOutputVolume };

  useEffect(() => {
    let raf = 0;
    let level = 0;
    const tick = (t: number) => {
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
      const breathe = 0.03 * Math.sin(t / 700);
      const scale = 1 + breathe + level * 0.45;
      if (coreRef.current) coreRef.current.style.transform = `scale(${scale.toFixed(3)})`;
      if (haloRef.current) {
        haloRef.current.style.transform = `scale(${(1.15 + level * 0.9).toFixed(3)})`;
        haloRef.current.style.opacity = (0.25 + level * 0.6).toFixed(3);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return (
    <div className="relative grid size-[clamp(9rem,32vw,14rem)] place-items-center" aria-hidden>
      <div
        ref={haloRef}
        className={`absolute inset-0 rounded-full blur-2xl transition-colors duration-500 ${
          speaking ? "bg-[var(--dawn)]" : "bg-[var(--sky)]"
        }`}
      />
      <div
        ref={coreRef}
        className={`relative size-full rounded-full transition-[background] duration-500 ${
          speaking ? "orb-speaking" : active ? "orb-listening" : "orb-idle"
        }`}
      />
    </div>
  );
}
