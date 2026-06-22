import ActivityKit
import WidgetKit
import SwiftUI

/// 锁屏与动态岛的 Live Activity 渲染。
///
/// 系统仍然只能自动推进日期区间；收入金额和有效计薪进度来自 App 快照。
/// 这里把快照做成「驾驶舱」视图：金额、下班倒计时、休息断点和加班状态同时可见。
struct HappyWorkLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkAttributes.self) { context in
            LockScreenView(context: context)
                .activityBackgroundTint(WidgetPalette.surface)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("截至 \(context.state.asOf, format: .dateTime.hour().minute())")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Text("¥" + money(context.state.earned))
                            .font(.title3.bold())
                            .monospacedDigit()
                    }
                }

                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("下班")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Text(timerInterval: context.attributes.timerRange, countsDown: true)
                            .font(.title3.bold())
                            .monospacedDigit()
                    }
                }

                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 6) {
                        WidgetProgressStrip(timerRange: context.attributes.timerRange,
                                            breakSegments: context.attributes.breakSegments)
                        HStack {
                            Text(context.state.statusTitle)
                            Spacer()
                            Text("目标 ¥" + money(context.state.targetEarned))
                                .monospacedDigit()
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                }
            } compactLeading: {
                Text(context.state.isOvertime ? "加班" : "计薪")
                    .font(.caption.bold())
            } compactTrailing: {
                Text(timerInterval: context.attributes.timerRange, countsDown: true)
                    .font(.caption2.bold())
                    .monospacedDigit()
            } minimal: {
                Text("¥")
                    .font(.caption.bold())
            }
        }
    }

    private func money(_ value: Double) -> String { String(format: "%.0f", value) }
}

private struct LockScreenView: View {
    let context: ActivityViewContext<WorkAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text("HappyWork")
                            .font(.caption.bold())
                            .foregroundStyle(.secondary)
                        if context.state.isOvertime {
                            Text("加班费")
                                .font(.caption2.bold())
                                .foregroundStyle(WidgetPalette.overtime)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(WidgetPalette.overtime.opacity(0.15), in: Capsule())
                        }
                    }
                    Text(context.state.statusTitle)
                        .font(.headline)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 3) {
                    Text("收入快照")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text("¥" + String(format: "%.0f", context.state.earned))
                        .font(.title2.bold())
                        .monospacedDigit()
                    Text("截至 \(context.state.asOf, format: .dateTime.hour().minute())")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            HStack(alignment: .firstTextBaseline) {
                Text("还剩")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(timerInterval: context.attributes.timerRange, countsDown: true)
                    .font(.title3.bold())
                    .monospacedDigit()
                Spacer()
                Text("目标 ¥" + String(format: "%.0f", context.state.targetEarned))
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }

            WidgetProgressStrip(timerRange: context.attributes.timerRange,
                                breakSegments: context.attributes.breakSegments)
        }
        .padding()
    }
}

private struct WidgetProgressStrip: View {
    var timerRange: ClosedRange<Date>
    var breakSegments: [WorkAttributes.BreakSegment]

    /// 休息标记的厚度，与系统线性进度条轨道保持一致，避免凸出成「大砖头」。
    private let markerHeight: CGFloat = 5

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            ZStack(alignment: .leading) {
                // 传空的 label / currentValueLabel，隐藏系统自带的计时文字
                // （否则会渲染出一段 HH:MM:SS 溢出到下一行）。
                ProgressView(timerInterval: timerRange, countsDown: false) {
                    EmptyView()
                } currentValueLabel: {
                    EmptyView()
                }
                .progressViewStyle(.linear)
                .tint(WidgetPalette.accent)
                ForEach(breakSegments, id: \.self) { segment in
                    RoundedRectangle(cornerRadius: markerHeight / 2, style: .continuous)
                        .fill(WidgetPalette.restSegment)
                        .frame(width: max(width * (segment.endRatio - segment.startRatio), 2),
                               height: markerHeight)
                        .offset(x: width * segment.startRatio)
                }
            }
        }
        .frame(height: 8)
    }
}

private enum WidgetPalette {
    static let surface = Color(red: 0.07, green: 0.08, blue: 0.10)
    static let accent = Color(red: 0.22, green: 0.95, blue: 0.55)
    static let restSegment = Color(red: 0.96, green: 0.66, blue: 0.30)
    static let overtime = Color(red: 1.0, green: 0.58, blue: 0.24)
}
