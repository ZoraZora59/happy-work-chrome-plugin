import Foundation
import Observation

@MainActor
final class EarningsService: ObservableObject {
    @Published private(set) var snapshot = EarningsSnapshot(
        startTime: .now,
        hourlyRate: 50,
        elapsed: 0,
        earned: 0,
        moodStage: .calm
    )

    private var timer: Timer?

    var progress: Double {
        min(snapshot.elapsed / 3600.0, 1.0)
    }

    var earningsString: String {
        String(format: "%.2f", snapshot.earned)
    }

    var elapsedString: String {
        let minutes = Int(snapshot.elapsed) / 60
        let seconds = Int(snapshot.elapsed) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }

    var progressDescription: String {
        "当前阶段：" + snapshot.moodStage.rawValue + " " + snapshot.moodStage.emoji
    }

    func startSession(start: Date, hourlyRate: Double) async {
        stopSession()
        snapshot = EarningsSnapshot(startTime: start, hourlyRate: hourlyRate, elapsed: 0, earned: 0, moodStage: .calm)
        scheduleTimer()
    }

    func stopSession() {
        timer?.invalidate()
        timer = nil
    }

    func update(rate: Double) {
        snapshot = EarningsSnapshot(
            startTime: snapshot.startTime,
            hourlyRate: rate,
            elapsed: snapshot.elapsed,
            earned: snapshot.earned,
            moodStage: snapshot.moodStage
        )
    }

    private func scheduleTimer() {
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                let now = Date()
                let elapsed = now.timeIntervalSince(snapshot.startTime)
                let earned = elapsed / 3600.0 * snapshot.hourlyRate
                let stage = Self.moodStage(for: elapsed)
                snapshot = EarningsSnapshot(startTime: snapshot.startTime, hourlyRate: snapshot.hourlyRate, elapsed: elapsed, earned: earned, moodStage: stage)
            }
        }
    }

    private static func moodStage(for elapsed: TimeInterval) -> EarningsSnapshot.MoodStage {
        switch elapsed {
        case 0..<900: return .calm
        case 900..<1800: return .focus
        case 1800..<2700: return .flow
        default: return .tired
        }
    }
}
