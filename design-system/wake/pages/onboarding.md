# Onboarding: build spec (overrides MASTER.md where they differ)

Context: hackathon build, judged live on a projector and in a 2-minute Loom. Every choice favors **a flawless demo** over completeness. Track: Open. User: "A college student who sleeps through their 8 AMs." Finish line: "Wake calls their phone at wake-up time, plans the day with them, and texts them the final plan."

## BRAND (RJ, 13:50, overrides everything below on color)
Logo: `web/public/brand/wake-logo.png` (glowing amber-to-orange alarm clock with a ribbon "W", on pure black). Icons already wired (`src/app/icon.png`, `apple-icon.png`, `manifest.ts`).
- **Background: pure black `#000000`** (the logo sits on black; RJ's asset wins over MASTER's "avoid pure black").
- **Brand gradient:** gold `#FFC21A` → amber `#FFA000` → orange `#FF6A00`, top-left to bottom-right, the same as the logo. Use it on the primary button, the logo mark, progress fill and the selected-card ring.
- **Glow:** the logo's soft orange outer glow (`0 0 24px rgba(255,140,0,.45)`) on the logo, the primary CTA and the ringing alarm screen only. Nowhere else.
- **Text:** white `#FFFFFF` primary, `rgba(255,255,255,.62)` secondary. Surfaces `#0D0D0D` / `#161616`, borders `rgba(255,255,255,.08)`.
- Indigo is dropped; the voice orb uses the brand gradient.
- The "sunrise" glow rising from the bottom stays, but in brand orange on black.

## The product in one line
Set up once in about 60 seconds. Every morning at your time, **Wake calls your phone**, gets you up, walks your day (weather, calendar, priorities), adjusts when you push back, and texts you the plan.

## Overrides to MASTER.md
- **Fonts:** Inter is too generic. Display: **Bricolage Grotesque** (600/700/800). Body: **Geist** (400/500). Times and digits: **JetBrains Mono** (500), `tabular-nums`. All from Google Fonts via `next/font/google`.
- **Palette (night to sunrise):** keep MASTER's tokens, but use amber `#F59E0B` (not `#D97706`) for text/CTA on the dark background, for 4.5:1 contrast. Background `#0B1020` with one slow, warm radial "sunrise" glow rising from the bottom edge as the user progresses (glow opacity tied to step index, so finishing setup literally brings up the sun). Indigo `#6366F1` only for the voice orb and focus rings.
- **Motion:** step transitions slide 24px + fade, 220ms, ease `cubic-bezier(0.16,1,0.3,1)`; exit faster (160ms). Respect `prefers-reduced-motion` (fade only). No GSAP needed; CSS or the motion already in the app.
- **Icons:** Lucide only (`lucide-react` is OK to add). No emoji anywhere.

## Layout
Single centered column, max-width 560px, big type for the projector (question headline 40-48px desktop, 30px mobile). Top: thin progress bar + "Step 2 of 6" + Back. Bottom: one primary button (full width on mobile), Enter key advances. Optional steps show a "Skip" text button.

## Steps (one question per screen; final order: 0 welcome, 1 name, 2 phone, 3 wake time, 4 calendar, 5 priorities, 6 voice + coach name, 6b context import, 7 done; it should feel like a conversation, not a form)
0. **Welcome.** Headline: "Your mornings, handled." Sub: "Wake calls you at your wake-up time, plans your day with you, and doesn't let you snooze." Visual: a phone mock ringing ("Wake · incoming call") with three lines of a sample transcript fading in. CTA: "Set up my mornings".
1. **Name.** "What should Wake call you?" Text input, autofocus. Required.
2. **Phone.** "Where should Wake call you?" US phone input, formats as you type `(619) 555-0123`, stores E.164 `+16195550123`. Validate on blur. Helper: "We only call at your wake-up time." Required.
3. **Wake time.** "When do you need to be up?" Large time picker (hour/minute steppers or chips: 6:00 / 6:30 / 7:00 / 7:30 / 8:00 + custom) and weekday toggles M T W T F S S (default weekdays). Required.
4. **Calendar (optional).** "Connect your calendar." Present it as a **Google Calendar connector card** (Google Calendar icon + "Connect"), which opens the paste flow below. Paste field for the Google Calendar secret iCal link + collapsible "Where do I find this?" with 3 steps (Google Calendar → Settings → your calendar → Secret address in iCal format). Secondary: "Use a demo calendar". Skip allowed.
5. **Priorities (optional).** "What has to get done this week?" Up to 3 rows: task + due (Today / Tomorrow / This week chips). Skip allowed.
6. **Coach voice + name.** "Pick your wake-up voice." Four cards from `src/lib/voices.ts` (`VOICE_PRESETS`): **Hype, Sunny, Calm, Coach**, each with label, tagline and a play button for `public/voices/<id>.mp3` (already generated). Selecting a card fills a text input below, "What do you want to call them?", with the preset's `defaultName` (editable, max 24 chars). This step matters for the "Best ElevenLabs build" prize (designed voices, voice fits the job).
6b. **Import your context (optional).** "Give {coachName} the backstory." Styled as a row of connector cards: **ChatGPT** and **Claude** (each opens a sheet: 1. copy this prompt "Tell me everything you know about me: my goals, schedule, school, work, habits, and what I'm working on. Plain text." with a Copy button, 2. paste the answer back here), plus **Write it yourself**. One textarea (`aboutMe`, max 4000 chars). Honest copy: it's a paste, not a login. Skip allowed.
7. **Done.** "You're set, {name}." Summary card: phone, time + days, calendar connected or demo, priorities count, voice. Primary CTA, huge: **"Call me now"** (triggers the real outbound call; this is the live demo moment). Secondary: "I'll wait for the morning". Show call state inline: Calling… → Ringing your phone → Connected (from the API response).

## Data
Saved on every step to `localStorage` (key `wake.profile`) and on finish POSTed to `/api/profile` (server writes `web/data/profile.json`, which the briefing and the call use).

Use the `Profile` type exported from `src/lib/profile.ts` (fields: name, phone, wakeTime, days, icalUrl, priorities, voice, coachName, aboutMe). Don't redefine it.

## Routes (owned by the backend side; the UI calls them)
- `POST /api/profile` → saves the Profile. `GET /api/profile` → returns it.
- `POST /api/call` → places the outbound call now via ElevenLabs (Twilio number), using the saved profile. Returns `{ ok, conversationId?, error? }`.
- Existing `/api/briefing` now reads name, calendar and priorities from the profile.

## After onboarding
The existing alarm/talk screen stays as the **web fallback** ("No phone? Talk in the browser"), since the rubric says a web demo counts. The home screen after setup shows: next call time, "Call me now", "Edit setup".

## Pre-delivery checklist (from the skill)
Visible labels on every input (no placeholder-only), errors next to the field, 44px minimum tap targets, visible focus rings, contrast 4.5:1, loading then success/error on every submit, Back always works, works at 375px and on a projector at 1440px, reduced motion respected.
