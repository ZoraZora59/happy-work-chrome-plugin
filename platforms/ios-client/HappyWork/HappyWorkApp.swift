import SwiftUI
import ActivityKit

@main
struct HappyWorkApp: App {
    @StateObject private var earningsService = EarningsService()
    @StateObject private var activityManager = LiveActivityManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(earningsService)
                .environmentObject(activityManager)
                .onAppear {
                    activityManager.attachService(earningsService)
                }
        }
    }
}
