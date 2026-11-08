/** One short tap, fired on the same frame as the visual it confirms. No-op where unsupported (iOS Safari). */
export function haptic(ms = 12) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(ms);
  } catch {
    /* blocked or unsupported */
  }
}
