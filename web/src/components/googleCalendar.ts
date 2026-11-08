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

// Google sign-in is switched off for the hackathon (test users only until Google verifies the app).
// Flip to true to bring "Connect Google Calendar" back; everything below still works.
const GOOGLE_ENABLED = false;
export const googleConfigured = () => GOOGLE_ENABLED && Boolean(CLIENT_ID);

function read(): Stored | null {
  if (!GOOGLE_ENABLED) return null;
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
  if (!GOOGLE_ENABLED) return false;
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
  return fetchRange(0, 0);
}

/** The next six days (tomorrow on), read-only, as one line per day for the agent's week_summary. */
export async function getGoogleWeekSummary(): Promise<string> {
  const events = await fetchRange(1, 6);
  if (!events) return "Calendar not connected, so you don't know the rest of the week.";
  const tz = "America/Los_Angeles";
  const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });
  const lines: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const d = new Date(Date.now() + i * 86_400_000);
    const key = d.toLocaleDateString("en-CA", { timeZone: tz });
    const label = d.toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "short", day: "numeric" });
    // An event belongs to every day it overlaps: overnight and multi-day events show on each day.
    // All-day end dates are exclusive in Google Calendar, so a one-day event ends the next morning.
    const all = events.filter((e) =>
      e.allDay
        ? e.start.slice(0, 10) <= key && key < e.end.slice(0, 10)
        : dayKey(e.start) <= key && key <= dayKey(new Date(Date.parse(e.end) - 1).toISOString()),
    );
    const items = all
      .slice(0, 8)
      .map((e) =>
        e.allDay
          ? `${e.title} (all day)`
          : `${new Date(e.start).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })} ${e.title}`,
      );
    if (all.length > items.length) items.push(`and ${all.length - items.length} more`);
    lines.push(`${label}: ${items.length ? items.join(", ") : "nothing scheduled"}`);
  }
  return lines.join(". ");
}

async function fetchRange(fromDay: number, toDay: number): Promise<GoogleEvent[] | null> {
  const s = read();
  if (!s) return null;
  const tz = "America/Los_Angeles";
  const dayAt = (offset: number) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: tz });
  // Days in the browser's local time (the demo laptop is in LA); the API returns times in `tz`.
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    timeZone: tz,
    timeMin: new Date(`${dayAt(fromDay)}T00:00:00`).toISOString(),
    timeMax: new Date(`${dayAt(toDay)}T23:59:59`).toISOString(),
  });
  type Item = { id?: string; summary?: string; location?: string; status?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } };
  try {
    // Follow nextPageToken (recurring events are expanded by singleEvents), up to 4 pages of 250.
    const items: Item[] = [];
    let pageToken = "";
    for (let page = 0; page < 4; page++) {
      if (pageToken) params.set("pageToken", pageToken);
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
      const data = (await res.json()) as { items?: Item[]; nextPageToken?: string };
      items.push(...(data.items ?? []));
      pageToken = data.nextPageToken ?? "";
      if (!pageToken) break;
    }
    const seen = new Set<string>();
    return items
      .filter((e) => e.status !== "cancelled" && !(e.id && seen.has(e.id)) && (e.id ? seen.add(e.id) : true))
      .map((e) => ({
        title: e.summary?.trim() || "Busy",
        start: e.start?.dateTime ?? `${e.start?.date}T00:00:00`,
        end: e.end?.dateTime ?? `${e.end?.date}T00:00:00`,
        allDay: !e.start?.dateTime,
        location: e.location,
      }))
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  } catch {
    return null;
  }
}
