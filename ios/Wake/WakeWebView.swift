import SwiftUI
import WebKit

/// Hosts the web app. Grants the mic to our own origin (the ElevenLabs session needs it) and exposes
/// `window.webkit.messageHandlers.wake` so the web app can schedule the native alarm.
struct WakeWebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.add(context.coordinator, name: "wake")
        // Lets the web app know it's inside the native shell.
        config.userContentController.addUserScript(WKUserScript(
            source: "window.wakeNative = { platform: 'ios', alarms: true };",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true))

        let web = WKWebView(frame: .zero, configuration: config)
        web.uiDelegate = context.coordinator
        web.isOpaque = false
        web.backgroundColor = .black
        web.scrollView.backgroundColor = .black
        web.load(URLRequest(url: url))
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        if web.url?.absoluteString != url.absoluteString { web.load(URLRequest(url: url)) }
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKUIDelegate {
        // Messages from the web app, e.g.
        // window.webkit.messageHandlers.wake.postMessage({ type: "setAlarm", wakeTime: "07:30", days: [1,2,3,4,5], coachName: "Wren" })
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
            switch type {
            case "setAlarm":
                guard let wake = body["wakeTime"] as? String else { return }
                let days = body["days"] as? [Int] ?? [1, 2, 3, 4, 5]
                let coach = body["coachName"] as? String ?? "Wake"
                Task { await AlarmScheduler.shared.schedule(wakeTime: wake, days: days, coachName: coach) }
            case "cancelAlarms":
                Task { await AlarmScheduler.shared.cancelAll() }
            default:
                break
            }
        }

        // Grant the microphone to our own page only, without a second web prompt.
        func webView(_ webView: WKWebView,
                     requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                     initiatedByFrame frame: WKFrameInfo,
                     type: WKMediaCaptureType,
                     decisionHandler: @escaping (WKPermissionDecision) -> Void) {
            decisionHandler(origin.host == LaunchRouter.baseURL.host ? .grant : .prompt)
        }
    }
}
