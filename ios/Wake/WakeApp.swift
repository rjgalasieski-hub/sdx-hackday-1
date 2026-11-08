import SwiftUI

// Native shell for Wake: the full web app runs in a WKWebView, and AlarmKit supplies the one thing
// a web page can't do, a real alarm that rings on a locked phone and through silent mode.
@main
struct WakeApp: App {
    @StateObject private var router = LaunchRouter()

    var body: some Scene {
        WindowGroup {
            WakeWebView(url: router.url)
                .ignoresSafeArea()
                .background(Color.black)
                .preferredColorScheme(.dark)
                .onOpenURL { router.handle($0) }
        }
    }
}

/// Decides which page to load. When the alarm's "I'm up" button opens the app, we load the web app
/// with `?ring=1` so it can jump straight into the live coach (web side: see ios/README.md).
@MainActor
final class LaunchRouter: ObservableObject {
    // Must be a public HTTPS deployment: WKWebView only allows the microphone on a secure origin.
    static let baseURL = URL(string: "https://YOUR-WAKE-DEPLOYMENT.vercel.app")!

    @Published var url: URL = LaunchRouter.baseURL

    init() {
        NotificationCenter.default.addObserver(forName: .wakeAlarmStopped, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.openRinging() }
        }
    }

    func handle(_ incoming: URL) {
        if incoming.host == "ring" { openRinging() }
    }

    func openRinging() {
        var c = URLComponents(url: Self.baseURL, resolvingAgainstBaseURL: false)!
        c.queryItems = [URLQueryItem(name: "ring", value: "1")]
        url = c.url!
    }
}
