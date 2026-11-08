import AlarmKit
import AppIntents
import SwiftUI

// AlarmKit (iOS 26+). Written against Apple's AlarmKit docs and WWDC25 sample; NOT yet compiled.
// If a name doesn't match your Xcode 26 SDK, Xcode's fix-its usually point at the right one.

struct WakeAlarmMetadata: AlarmMetadata {
    var coachName: String
}

@MainActor
final class AlarmScheduler {
    static let shared = AlarmScheduler()
    private var scheduled: [UUID] = []

    func requestAccess() async -> Bool {
        do {
            let state = try await AlarmManager.shared.requestAuthorization()
            return state == .authorized
        } catch {
            print("[alarm] authorization failed:", error)
            return false
        }
    }

    /// Schedules a repeating alarm at wakeTime ("HH:MM", 24h) on the given weekdays (0 = Sun ... 6 = Sat).
    func schedule(wakeTime: String, days: [Int], coachName: String) async {
        guard await requestAccess() else { return }
        await cancelAll()

        let parts = wakeTime.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return }
        let weekdays: [Locale.Weekday] = days.compactMap { Self.weekday($0) }

        let alert = AlarmPresentation.Alert(
            title: "\(coachName) is calling",
            stopButton: AlarmButton(text: "I'm up", textColor: .black, systemImageName: "sun.max.fill"),
            secondaryButton: nil,
            secondaryButtonBehavior: nil
        )
        let attributes = AlarmAttributes<WakeAlarmMetadata>(
            presentation: AlarmPresentation(alert: alert),
            metadata: WakeAlarmMetadata(coachName: coachName),
            tintColor: Color(red: 1.0, green: 0.63, blue: 0.0)
        )
        let time = Alarm.Schedule.Relative.Time(hour: parts[0], minute: parts[1])
        let schedule = Alarm.Schedule.relative(.init(
            time: time,
            repeats: weekdays.isEmpty ? .never : .weekly(weekdays)
        ))
        // A bundled ~20s clip of the coach's voice (wake-greeting.caf) can replace the default sound:
        // see ios/README.md. Kept on the system sound until that's tested on a device.
        let configuration = AlarmManager.AlarmConfiguration<WakeAlarmMetadata>(
            schedule: schedule,
            attributes: attributes,
            stopIntent: OpenWakeIntent()
        )

        let id = UUID()
        do {
            _ = try await AlarmManager.shared.schedule(id: id, configuration: configuration)
            scheduled.append(id)
        } catch {
            print("[alarm] schedule failed:", error)
        }
    }

    func cancelAll() async {
        for id in scheduled { try? AlarmManager.shared.cancel(id: id) }
        scheduled.removeAll()
    }

    private static func weekday(_ d: Int) -> Locale.Weekday? {
        [.sunday, .monday, .tuesday, .wednesday, .thursday, .friday, .saturday][safe: d]
    }
}

/// Runs when "I'm up" is tapped on the alarm: opens Wake into the live coach.
struct OpenWakeIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "I'm up"
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        await MainActor.run { NotificationCenter.default.post(name: .wakeAlarmStopped, object: nil) }
        return .result()
    }
}

extension Notification.Name {
    static let wakeAlarmStopped = Notification.Name("wakeAlarmStopped")
}

private extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}
