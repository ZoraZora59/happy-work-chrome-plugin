import SwiftUI

@main
struct HappyWorkApp: App {
    @StateObject private var settings = SettingsStore()
    @StateObject private var earnings = EarningsService()
    @StateObject private var liveActivity = LiveActivityManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(settings)
                .environmentObject(earnings)
                .environmentObject(liveActivity)
                .task {
                    // 恢复重启前仍存活的会话与 Live Activity。
                    liveActivity.restore()
                    if let session = settings.activeSession {
                        earnings.resume(session)
                    }
                }
        }
    }
}
