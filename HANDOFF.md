# HANDOFF: Wake (SDx SDSU Voice Agent Hackathon, Sun Nov 8 2026)

Read this first in a fresh session. Written ~2:55 PM by the previous Claude session (context was getting long).

## Deadlines
- **4:15 PM: submissions close.** Needs: public repo link, 2-minute Loom of a live conversation (judges stop at 2:00), track + user + finish line. Submission text is drafted at the bottom of this file.
- **4:15–4:55:** judges screen Looms. **5:00–5:45:** 8 finalists demo live, 5 min each incl. questions. **~5:45:** winners.
- Plan: fixes until ~3:20 → final live run → **Loom at ~3:35** (Thor records) → **submit ~3:55**.

## What Wake is
A JARVIS-style AI wake-up coach. Onboarding → alarm rings → voice coach (ElevenLabs Agent) briefs you (weather, calendar, priorities), builds a time-blocked plan live via a tool that runs our scheduler in a **Daytona** sandbox, re-plans on curveballs, pushes back on snooze, then **locks** the plan with Add to Google Calendar buttons. English + Spanish.
- **Track:** Open · **User:** a college student who sleeps through their 8 AMs · **Finish line:** out of bed with today's plan locked to their calendar.
- Judging rubric (out of 40): Works live ×2 (<1.5s replies, interruptions), Solves the problem ×2 (real action), Technical depth, Curveballs (judge changes mind mid-task / goes off-topic, same two for every team), Daytona, Demo. Separate prize: Best ElevenLabs build.

## Where everything is
- **Repo (public):** https://github.com/rjgalasieski-hub/sdx-hackday-1 · local: `~/Documents/hackday-1/sdx-hackday-1` · app in `web/` (Next.js 15.5.29, React 19.3.1, Tailwind v4).
- **Live:** https://sdx-hackday-1.vercel.app. **Every push to `main` auto-deploys in ~2 min.** Never push without telling RJ. Vercel project `sdx-hackday-1`, root dir `web`, env vars set: `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`, `DAYTONA_API_KEY`. QR: `demo/wake-qr.png`.
- **Local dev:** `cd web && npx next dev -p 3000` (a dev server may already be running in the background).
- **Keys (never print them):** RJ's vault `/Users/rjgalasieski/Documents/rj-hq/.env` has `ELEVENLABS_API_KEY` (restricted, Agents write), `DAYTONA_API_KEY`, `VERCEL_TOKEN` (1-day). `web/.env.local` has `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`, `DAYTONA_API_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (empty until Thor sends it). Read with `grep '^KEY=' file | cut -d= -f2-` into a variable. When printing env files, mask values (BSD sed: `sed -E 's/=.+/=…/'`; an earlier `\+` leaked a key).
- **ElevenLabs agent:** `agent_8401m6ygrs6kefg8a4bgxnrhfk4r` ("Wake - Morning Briefing"). The source of truth for its config is the live agent (GET `/v1/convai/agents/{id}`); `agent/agent-config.json` mirrors it (keep it in sync when you PATCH). Prompt notes: `agent/wake-agent.md`. Knowledge base: `agent/knowledge/morning-playbook.md`. Teammates clone it with `agent/clone-agent.mjs`.
- **Credits:** ElevenLabs Creator, 131k credits, ~1.5k used at 2:20. Only RJ + Thor run full voice tests, ≤30s each. The old `simulate-conversation` endpoint returns 410; use the agent-testing API if you simulate.

## Architecture (short)
- Browser starts the ElevenLabs session (WebRTC, WebSocket fallback) with the briefing as dynamic variables (`name, coach_name, personality, about_me, date, weather_summary, calendar_summary, tasks_summary, voice_id, language, language_name`) and per-user overrides (TTS voice; Spanish → agent language + Spanish first message + `eleven_flash_v2_5`). English agent must stay on `eleven_flash_v2`.
- Client tools (in `web/src/components/planTools.tsx` + `WakeApp.tsx`): `build_plan(tasks[], adjustments[])` → POST `/api/plan`; `lock_plan(note?)` → `/api/plan/lock`; `snooze(minutes)` ends the call and re-arms (1 per morning, 5s timer cancelled by End).
- Planner: `web/src/lib/planner-core.ts` is fully self-contained (no imports, no top-level helpers) because `lib/plan.ts` ships `planDay.toString()` into ONE reused, labeled Daytona sandbox (`labels: {app: "wake-planner"}`), raced against a 9s deadline, local fallback. Plans start from **now** (LA time), only today's events, cumulative + fuzzy adjustments, conflicts reported, short spoken summary.
- Data: each user's profile lives ONLY in their browser (`localStorage["wake.profile"]`, Google token in `wake.gcal`) and is sent with every request. The server stores nothing (fixed a bug where it fell back to RJ's saved profile). Real users never get sample tasks/classes; those only appear if `profile.demoCalendar` is true.
- Google Calendar: in-browser GIS token flow (`components/googleCalendar.ts`), events sent as `calendarEvents`. Needs `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; Thor is creating it (test users only; origins `http://localhost:3000` and `https://sdx-hackday-1.vercel.app`). When he sends it: add to `web/.env.local` and to Vercel env (API: POST `/v10/projects/sdx-hackday-1/env?upsert=true`), then redeploy.
- Voices (`web/src/lib/voices.ts`): Signature (custom Voice Design voice `uZ50Ubxg5wgY62RReo7l`), Hype, Sunny, Calm, Coach. Samples in `web/public/voices/`.
- UI: Onboarding, Home, Settings (with Reset Wake for back-to-back judges), ringing/talking/done. Built with Fable 5.1 subagents per RJ; brand in `design-system/wake/pages/onboarding.md` (pure black, gold→orange gradient, glow). Apple-design polish applied. Bedside mode keeps the screen awake while armed.

## Audit (2:45 PM): 4 persona/code auditors. Status:
**Fixed and pushed:** plans in the past; other days' events; only-first-adjustment; "2" → 2 AM / "6 PM" parsing; fuzzy remove over/under-matching; overlap detection; robotic spoken summary; Daytona double-retry > tool timeout (now one attempt raced at 9s); agent faking a locked plan on tool failure (prompt rule); snooze without push-back + 2 snoozes (prompt + client cap); 50–70-word turns / no contractions (prompt); max call 150s → 300s; snooze timer firing after End; call starting after End during loading; cards showing the server's demo day to every user; broken iCal → demo day; planner response not checked; "X due is due at".

**Also fixed and pushed (Fable, ~3:00):** Home "day at a glance" (weather, next Google event, top priority, with coach fallback lines), time-aware greeting, data-driven subtitle ("Jarvis has 2 priorities. Rings 7:30 AM tomorrow."), phone voice-step padding so the language toggle isn't hidden, Done-step copy for skipped steps, duplicate "Edit setup" removed on phone.

**Still open (ranked):**
1. **Re-verify the conversation after the prompt rewrite**: one short live run (or 1–2 agent-testing sims with real mock return values): proposes tasks from backstory, calls build_plan with tasks, curveball re-plan, push-back on first snooze, lock only after success, turns ≤25 words.
2. **Fallback briefing invents details** (`components/briefing.ts` `fallbackBriefing`): uses "there"/Sunny/a fake 10 AM class when the briefing times out. Build it from the saved profile + neutral calendar text.
3. **Google token expires after 1h** with no refresh → calendar silently "wide open". Reconnect right before judging; ideally show a Reconnect banner when `wake.gcal` is expired.
4. `lock_plan` fetch in `planTools.tsx` has no try/catch.
5. Planner: deadline-aware prep blocks; mention all-day events instead of dropping them; stop tasks at dayEnd near deadlines.
6. Timezone is hardcoded to America/Los_Angeles (fine for SD judges; send the browser timezone for anyone else). Weather always San Diego.
7. Copy tone pass (welcome headline/CTA more JARVIS-confident) was skipped for time. Settings is a long scroll (accordion summary rows would help). Reset Wake has no "reset" toast. Español toggle wasn't clicked in the audit; check it by hand.
8. Consider `gemini-2.5-flash` for the agent LLM (tone, brevity) only if a live test shows latency stays <1.5s.
9. `Onboarding.tsx` header comment still mentions the removed phone step.

**Deferred on purpose (in README "What's next"):** native iOS AlarmKit wrapper (`ios/`, starter code, uncompiled; this Mac is macOS 14.4 with no Xcode, AlarmKit needs Xcode 26), Twilio phone calls, Supabase/login (RJ raised it; doesn't fix any audit issue and scores no rubric points; post-hackathon), Google verification, memory across mornings.

## Rules RJ set / learned today
- It's for the hackathon: optimize for the live demo and the rubric. Short answers, verdict first.
- UI work goes to Fable 5.1 subagents (`model: "fable"`) using the ui-ux-pro-max / apple-design skills.
- No em dashes in any user-facing copy. Never commit keys. Never use the DYLD OpenRouter key.
- Team GitHub: samdcater, thorhans3n, ihatenate (all collaborators). Thor does the demo laptop + Loom.

## Loom flow (≤2:00)
Start on the alarm ringing (skip onboarding or show 5s of it) → "I'm up" → coach greets by name → "five more minutes" (push-back) → it proposes the day from the backstory → curveball: "move gym to 6 and drop the club meeting" → re-plan ("Planned in Daytona" on the card) → "lock it" → calendar buttons → end. Reset Wake before recording.

## Submission text
```
Track: Open
User: A college student who sleeps through their 8 AMs.
Finish line: Wake gets them out of bed, plans their day with them out loud, and locks the plan to their Google Calendar.
What it does: Set up once (name your coach, pick a voice including a custom ElevenLabs-designed one, connect Google Calendar, paste what ChatGPT knows about you). At your wake time the alarm rings and your coach talks you through the morning. It builds a time-blocked plan live through a tool call that runs our scheduler in a Daytona sandbox, re-plans when you change your mind, pushes back once if you try to snooze, and locks the plan with Add to Google Calendar buttons. English and Spanish.
Built with: ElevenLabs Agents (client tools, designed voice, 5 voice presets, knowledge base, tuned turn-taking, Spanish), Daytona (live planner sandbox), Next.js.
Repo: https://github.com/rjgalasieski-hub/sdx-hackday-1
Live: https://sdx-hackday-1.vercel.app
```

## Verify command (use before every push)
`cd web && npx tsc --noEmit && npx next lint --quiet && NEXT_DIST_DIR=.next-verify npm run build; rm -rf .next-verify`
