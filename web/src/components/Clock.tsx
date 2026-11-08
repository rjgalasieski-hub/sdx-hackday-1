"use client";
import { formatClock, formatDate, useNow } from "./useNow";

export function Clock({ size = "xl" }: { size?: "xl" | "lg" }) {
  const now = useNow();
  const big = size === "xl" ? "text-[clamp(5rem,20vw,12rem)]" : "text-[clamp(4rem,16vw,9rem)]";
  if (!now) {
    return <div className={`${big} tnum font-display leading-none opacity-0`}>0:00</div>;
  }
  const { hm, ampm } = formatClock(now);
  return (
    <div className="flex flex-col items-center">
      <div className={`${big} tnum font-display font-bold leading-none tracking-tight`}>
        {hm}
        <span className="ml-2 align-top text-[0.22em] font-semibold tracking-normal text-[var(--muted)]">{ampm}</span>
      </div>
      <div className="mt-3 text-[clamp(1rem,2.5vw,1.35rem)] text-[var(--muted)]">{formatDate(now)}</div>
    </div>
  );
}
