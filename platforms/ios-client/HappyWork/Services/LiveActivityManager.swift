import ActivityKit
import Foundation

@MainActor
final class LiveActivityManager: ObservableObject {
    private weak var earningsService: EarningsService?
    private var activity: Activity<WorkAttributes>?

    func attachService(_ service: EarningsService) {
        earningsService = service
    }

    func startLiveActivity() {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        guard let snapshot = earningsService?.snapshot else { return }

        let contentState = WorkAttributes.ContentState(
            earned: snapshot.earned,
            elapsed: snapshot.elapsed,
            mood: snapshot.moodStage.rawValue,
            emoji: snapshot.moodStage.emoji
        )

        let attributes = WorkAttributes(hourlyRate: snapshot.hourlyRate)
        activity = try? Activity.request(attributes: attributes, contentState: contentState, pushType: nil)
    }

    func updateLiveActivity() {
        guard let activity, let snapshot = earningsService?.snapshot else { return }
        let contentState = WorkAttributes.ContentState(
            earned: snapshot.earned,
            elapsed: snapshot.elapsed,
            mood: snapshot.moodStage.rawValue,
            emoji: snapshot.moodStage.emoji
        )
        Task {
            await activity.update(using: contentState)
        }
    }

    func endLiveActivity() {
        guard let activity else { return }
        Task {
            await activity.end(dismissalPolicy: .immediate)
        }
        self.activity = nil
    }
}
