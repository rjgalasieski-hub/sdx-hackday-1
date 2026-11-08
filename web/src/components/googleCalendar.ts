"use client";
// "Connect Google Calendar": Google Identity Services token flow, fully in the browser.
// No client secret, no redirect: the access token (1 hour) reads today's events straight from the
// Calendar API, and those events ride along to /api/briefing and /api/plan as `calendarEvents`.
// Needs NEXT_PUBLIC_GOOGLE_CLIENT_ID with http://localhost:3000 as an authorized JavaScript origin.

export type GoogleEvent = { title: string; start: string; end: string; allDay: boolean; location?: string };

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const STORE = "wake.gcal";

type Stored = { token: string; expiresAt: number; email?: string };
type TokenResponse = { access_token?: string; expires_in?: number; error?: string; error_description?: string };
type GoogleOAuth = {
  accounts: { oauth2: { initTokenClient: (cfg: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string; message?: string }) => void }) => { requestAccessToken: (o?: { prompt?: string }) => void } } };
};

export const googleConfigured = () => Boolean(CLIENT_ID);

function read(): Stored | null {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? "null") as Stored | null;
    return s && s.token && s.expiresAt > Date.now() + 60_000 ? s : null;
  } catch {
    return null;
  }
}

export function isGoogleConnected(): boolean {
  return read() !== null;
}

/** Connected once, but the 1-hour token has lapsed (or Google rejected it). */
export function isGoogleExpired(): boolean {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? "null") as Stored | null;
    return Boolean(s?.token) && read() === null;
  } catch {
    return false;
  }
}

export function disconnectGoogle() {
  try {
    localStorage.removeItem(STORE);
  } catch {}
}

let scriptPromise: Promise<GoogleOAuth> | null = null;
function loadGis(): Promise<GoogleOAuth> {
  const w = window as unknown as { google?: GoogleOAuth };
  if (w.google?.accounts?.oauth2) return Promise.resolve(w.google);
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => (w.google ? resolve(w.google) : reject(new Error("Google sign-in didn't load.")));
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Couldn't reach Google. Check your connection."));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/** Opens Google's consent popup. Call it from a click. Resolves with today's event count. */
export async function connectGoogleCalendar(): Promise<{ ok: boolean; count?: number; error?: string }> {
  if (!CLIENT_ID) return { ok: false, error: "Google Calendar isn't set up yet (missing client ID). Use the iCal link instead." };
  let google: GoogleOAuth;
  try {
    google = await loadGis();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const token = await new Promise<TokenResponse>((resolve) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: resolve,
      error_callback: (e) => resolve({ error: e.type, error_description: e.message }),
    });
    client.requestAccessToken({ prompt: "consent" });
  });
  if (!token.access_token) {
    const closed = token.error === "popup_closed" || token.error === "access_denied";
    return { ok: false, error: closed ? "Google sign-in was closed before it finished." : `Google said no: ${token.error_description || token.error}` };
  }
  try {
    localStorage.setItem(STORE, JSON.stringify({ token: token.access_token, expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000 }));
  } catch {}
  const events = await getGoogleEvents();
  if (!events) return { ok: false, error: "Connected, but couldn't read your calendar. Try again." };
  return { ok: true, count: events.length };
}

/** Today's events (America/Los_Angeles) from the primary calendar, or null if not connected / failed. */
export async function getGoogleEvents(): Promise<GoogleEvent[] | null> {
  const s = read();
  if (!s) return null;
  const tz = "America/Los_Angeles";
  const day = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  // Today in the browser's local day (the demo laptop is in LA); the API returns times in `tz`.
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "25",
    timeZone: tz,
    timeMin: new Date(`${day}T00:00:00`).toISOString(),
    timeMax: new Date(`${day}T23:59:59`).toISOString(),
  });
  try {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${s.token}` },
    });
    if (res.status === 401) {
      try {
        localStorage.setItem(STORE, JSON.stringify({ ...s, expiresAt: 0 }));
      } catch {}
      return null;
    }
    if (!res.ok) return null;
    const data = (await res.json()) as {
      items?: { summary?: string; location?: string; status?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }[];
    };
    return (data.items ?? [])
      .filter((e) => e.status !== "cancelled")
      .map((e) => ({
        title: e.summary?.trim() || "Busy",
        start: e.start?.dateTime ?? `${e.start?.date}T00:00:00`,
        end: e.end?.dateTime ?? `${e.end?.date}T00:00:00`,
        allDay: !e.start?.dateTime,
        location: e.location,
      }));
  } catch {
    return null;
  }
}
