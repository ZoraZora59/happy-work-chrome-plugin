import ActivityKit
import WidgetKit
import SwiftUI

struct HappyWorkLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkAttributes.self) { context in
            lockScreenView(for: context.state, attributes: context.attributes)
                .activityBackgroundTint(.black.opacity(0.2))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    emojiState(context.state)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("¥" + formatted(context.state.earned))
                        .font(.title3.bold())
                }
                DynamicIslandExpandedRegion(.bottom) {
                    progressBar(state: context.state, hourlyRate: context.attributes.hourlyRate)
                }
            } compactLeading: {
                emojiState(context.state)
            } compactTrailing: {
                Text("¥" + formatted(context.state.earned))
                    .font(.caption)
            } minimal: {
                emojiState(context.state)
            }
        }
    }

    private func lockScreenView(for state: WorkAttributes.ContentState, attributes: WorkAttributes) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                emojiState(state)
                VStack(alignment: .leading, spacing: 2) {
                    Text("打工进行中")
                        .font(.headline)
                    Text("时薪 ¥" + formatted(attributes.hourlyRate))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(elapsedString(state.elapsed))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            progressBar(state: state, hourlyRate: attributes.hourlyRate)
        }
        .padding()
    }

    private func progressBar(state: WorkAttributes.ContentState, hourlyRate: Double) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ProgressView(value: min(state.elapsed / 3600, 1))
                .tint(.green)
            HStack {
                Text("已赚 ¥" + formatted(state.earned))
                Spacer()
                Text(state.mood)
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
    }

    private func emojiState(_ state: WorkAttributes.ContentState) -> some View {
        Text(state.emoji)
            .font(.title2)
    }

    private func formatted(_ value: Double) -> String {
        String(format: "%.2f", value)
    }

    private func elapsedString(_ seconds: TimeInterval) -> String {
        let minutes = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%02d:%02d", minutes, secs)
    }
}

extension HappyWorkLiveActivity: PreviewProvider {
    static var previews: some View {
        HappyWorkLiveActivity()
            .previewContext(WorkAttributes(hourlyRate: 50), state: WorkAttributes.ContentState(earned: 20.5, elapsed: 1200, mood: "专注冲刺", emoji: "🚀"))
    }
}
