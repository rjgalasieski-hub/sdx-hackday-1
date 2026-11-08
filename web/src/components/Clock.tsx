"use client";
import { formatClock, formatDate, useNow } from "./useNow";

export function Clock({ size = "xl" }: { size?: "xl" | "lg" }) {
  const now = useNow();
  const big =
    size === "xl"
      ? "text-[clamp(5rem,22vw,13rem)]"
      : "text-[clamp(4rem,18vw,10rem)]";
  if (!now) {
    return <div className={`${big} font-light leading-none tabular-nums opacity-0`}>0:00</div>;
  }
  const { hm, ampm } = formatClock(now);
  return (
    <div className="flex flex-col items-center">
      <div className={`${big} font-extralight leading-none tracking-tight tabular-nums`}>
        {hm}
        <span className="ml-3 align-top text-[0.22em] font-normal tracking-normal opacity-60">
          {ampm}
        </span>
      </div>
      <div className="mt-3 text-[clamp(1rem,3vw,1.5rem)] text-[var(--muted)]">{formatDate(now)}</div>
    </div>
  );
}
