# Wake for iOS (native alarm wrapper), work in progress

**Status: starter code, not built or tested yet.** Written during the hackathon as the "what's next" step. The web app in `/web` is the product; this wraps it.

## Why native
A web page can't ring when the phone is locked or on silent. Apple's **AlarmKit** (iOS 26+) can. The plan is a thin native shell:
- **WKWebView** runs the full Wake web app (onboarding, coach, Daytona planner, all unchanged)
- **AlarmKit** schedules the real alarm at the user's wake time and days
- Tapping **"I'm up"** on the alarm opens the app into the live coach (`?ring=1`)

## Files
| File | What |
|---|---|
| `Wake/WakeApp.swift` | App entry, picks the URL (normal or `?ring=1` after the alarm) |
| `Wake/WakeWebView.swift` | WKWebView, mic permission for our origin, `wake` message bridge |
| `Wake/AlarmScheduler.swift` | AlarmKit authorization + scheduling, and the "I'm up" App Intent |

## Build it (Mac, Xcode 26, iPhone on iOS 26)
1. Xcode → New Project → iOS App → SwiftUI, name **Wake**, deployment target **iOS 26**. Delete the template `ContentView.swift` and app file, then drag in the three files from `Wake/`.
2. Info.plist keys:
   - `NSMicrophoneUsageDescription`: "Wake talks with you when your alarm goes off."
   - `NSAlarmKitUsageDescription`: "Wake sets your wake-up alarm."
3. Set `LaunchRouter.baseURL` to a **public HTTPS** deployment of `/web` (WKWebView only allows the mic on a secure origin, so localhost over Wi-Fi won't work).
4. Signing & Capabilities → your team. Run on a real iPhone (AlarmKit needs a device).

## Still to do
- **Web side:** when `window.wakeNative` exists, post `{ type: "setAlarm", wakeTime, days, coachName }` on "Set my alarm", and when the page loads with `?ring=1`, go straight to the ringing/talking screen.
- **Coach voice as the alarm sound:** render a ~20s greeting in the user's chosen voice with ElevenLabs, bundle it as `wake-greeting.caf`, and pass it as the alarm sound. Test on device first; custom alarm sounds have been reported flaky in the betas.
- **Google sign-in:** Google blocks OAuth inside embedded web views, so in the native shell the calendar step should use the iCal link, or move sign-in to `ASWebAuthenticationSession`.
- **TestFlight:** internal testers only until Apple's beta review passes.
