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
                    if let session = settings.activeSession(for: Date()) {
                        earnings.resume(session)
                    } else {
                        // 没有当天进行中的会话，残留的实时活动只会展示过期快照。
                        liveActivity.end()
                        if let record = settings.stoppedWorkRecord() {
                            earnings.restoreStopped(record)
                        }
                    }
                }
        }
    }
}
