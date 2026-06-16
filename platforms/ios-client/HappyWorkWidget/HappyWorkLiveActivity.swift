import ActivityKit
import WidgetKit
import SwiftUI

/// 锁屏与动态岛的 Live Activity 渲染。
///
/// 关键：系统计时视图只能自动推进日程时间；App 内收入才会扣除午休/晚休并计算加班费。
/// **收入金额**是 ContentState 里的快照，只在 App/推送更新时变化，并附「截至 HH:mm」说明。
struct HappyWorkLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkAttributes.self) { context in
            LockScreenView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.25))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.state.emoji).font(.title2)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("¥" + money(context.state.earned))
                        .font(.title3.bold()).monospacedDigit()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 4) {
                        ProgressView(timerInterval: context.attributes.timerRange, countsDown: false)
                            .tint(.green)
                        HStack {
                            Text("日程进度")
                            Spacer()
                            Text(timerInterval: context.attributes.timerRange, countsDown: false)
                                .monospacedDigit()
                        }
                        .font(.caption).foregroundStyle(.secondary)
                    }
                }
            } compactLeading: {
                Text(context.state.emoji)
            } compactTrailing: {
                Text("¥" + money(context.state.earned)).monospacedDigit()
            } minimal: {
                Text(context.state.emoji)
            }
        }
    }

    private func money(_ value: Double) -> String { String(format: "%.0f", value) }
}

private struct LockScreenView: View {
    let context: ActivityViewContext<WorkAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                Text(context.state.emoji).font(.largeTitle)
                VStack(alignment: .leading, spacing: 2) {
                    Text("打工进行中").font(.headline)
                    Text("时薪 ¥\(String(format: "%.0f", context.attributes.hourlyRate)) · \(context.state.mood)")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("¥" + String(format: "%.0f", context.state.earned))
                        .font(.title2.bold()).monospacedDigit()
                    Text("截至 \(context.state.asOf, format: .dateTime.hour().minute())")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }

            ProgressView(timerInterval: context.attributes.timerRange, countsDown: false)
                .tint(.green)

            HStack(spacing: 4) {
                Text("日程进度")
                Text(timerInterval: context.attributes.timerRange, countsDown: false)
                    .monospacedDigit()
                Spacer()
                if context.isStale {
                    Text("数据已过期").foregroundStyle(.orange)
                }
            }
            .font(.caption).foregroundStyle(.secondary)
        }
        .padding()
    }
}
