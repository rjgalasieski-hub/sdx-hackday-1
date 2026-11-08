/* eslint-disable @next/next/no-img-element */
import { APP_NAME } from "./config";

/** The glowing alarm-clock mark. `size` is the rendered box in px; the PNG has its own black bg, so it only sits on black. */
export function Logo({ size = 48, pulse = false, className = "" }: { size?: number; pulse?: boolean; className?: string }) {
  return (
    <img
      src="/brand/wake-logo.png"
      alt={APP_NAME}
      width={size}
      height={size}
      draggable={false}
      className={`logo-glow select-none rounded-full ${pulse ? "logo-pulse" : ""} ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function Wordmark({ size = 36 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <Logo size={size} />
      <span className="font-display text-xl font-bold tracking-tight">{APP_NAME}</span>
    </div>
  );
}
