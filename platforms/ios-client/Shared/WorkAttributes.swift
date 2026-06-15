import ActivityKit
import Foundation

/// Live Activity 属性，**App 与 Widget Extension 共用**（project.yml 中此文件同时
/// 加入两个 target 的 sources）。
///
/// 设计要点（决定了锁屏实时性的边界）：
/// - `startDate`/`endDate` 定义本次打工时段。Widget 用这个区间配合
///   `Text(timerInterval:)` 和 `ProgressView(timerInterval:)` 渲染——**已工作时长
///   与进度条会在锁屏上自动走动，即使 App 没有运行**，因为系统会自行插值时间类视图。
/// - 收入金额（`ContentState.earned`）是系统无法插值的任意数字，因此它是一个
///   **快照**：只在 App（或推送）调用 update 时刷新。详见 README「锁屏实时性的边界」。
struct WorkAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// `asOf` 时刻已赚取金额（元）。下次 update 前保持不变。
        var earned: Double
        /// `earned` 的采样时刻。
        var asOf: Date
        /// `asOf` 时刻的心情阶段名称。
        var mood: String
        /// `asOf` 时刻的心情 emoji。
        var emoji: String
    }

    /// 有效时薪（基础 + 折算后的年终奖），元/小时。
    var hourlyRate: Double
    /// 打工时段开始时间。
    var startDate: Date
    /// 打工时段结束时间（= startDate + 工作时长），保证 > startDate。
    var endDate: Date
}

extension WorkAttributes {
    /// 供系统计时视图使用的安全日期区间（防止 start >= end 触发崩溃）。
    var timerRange: ClosedRange<Date> {
        endDate > startDate ? startDate...endDate : startDate...startDate.addingTimeInterval(1)
    }
}
