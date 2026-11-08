# Contract between the pieces (read before editing)

Flow: user sets alarm on `/` → alarm rings at that time → user taps "I'm up" (or it auto-starts) → page fetches `GET /api/briefing` → starts an ElevenLabs Conversation with `agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID` and passes the briefing as **dynamic variables** → the agent talks through the morning.

## API (owned by the data agent) — all GET, JSON, never throw: on failure return demo data + `"source": "demo"`
- `/api/weather?lat=32.7757&lon=-117.0719` (defaults = SDSU) →
  `{ source, location, tempF, highF, lowF, precipChance, conditions, wear }`
- `/api/calendar` → reads `process.env.ICAL_URL` (Google Calendar "secret address in iCal format"). Today's events only, America/Los_Angeles.
  `{ source, events: [{ title, start, end, allDay, location }] }` (start/end as ISO strings)
- `/api/tasks` → from `src/data/tasks.json`. `{ source, tasks: [{ title, due, priority }] }`
- `/api/briefing` → combines the three:
  `{ name, date, weather_summary, calendar_summary, tasks_summary }` — every field a plain-English string, ready to be read aloud.

## Dynamic variables the agent expects (exact keys)
`name`, `date`, `weather_summary`, `calendar_summary`, `tasks_summary` — the frontend passes `/api/briefing`'s JSON straight through.

## Env (`web/.env.local`, never committed)
- `NEXT_PUBLIC_ELEVENLABS_AGENT_ID=` (set by RJ)
- `ICAL_URL=` (optional; demo calendar if empty)
- `USER_NAME=RJ`
