// Single place to rename the app or tweak demo timings.
export const APP_NAME = "Wake";
export const APP_TAGLINE = "Your morning, talked through.";

// Inlined at build time by Next.js. Restart `next dev` after changing .env.local.
export const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? "";

// "Demo: ring in 10 seconds" button.
export const DEMO_DELAY_MS = 10_000;

// How long to wait for /api/briefing before falling back to local demo text.
export const BRIEFING_TIMEOUT_MS = 6_000;
