import Foundation

/// 一次打工时段。`startDate...endDate` 既驱动 App 内的每秒计算，也作为 Live Activity
/// 的属性传给 Widget，用系统计时视图在锁屏上自动走时长与进度。
struct WorkSession: Codable, Equatable {
    var startDate: Date
    var endDate: Date
    /// 会话开始时锁定的有效时薪（元/小时）。
    var hourlyRate: Double

    /// 工作时长（秒），至少 1 秒，避免除零与非法区间。
    var duration: TimeInterval { max(endDate.timeIntervalSince(startDate), 1) }

    /// 是否已到收工时间。
    func isComplete(at now: Date = Date()) -> Bool { now >= endDate }

    /// 计算 `now` 时刻的收入快照。已工作时长 / 收入 / 进度在收工后全部封顶。
    func snapshot(at now: Date = Date()) -> EarningsSnapshot {
        let elapsed = min(max(now.timeIntervalSince(startDate), 0), duration)
        let earned = elapsed / 3600.0 * hourlyRate
        let progress = elapsed / duration
        return EarningsSnapshot(
            elapsed: elapsed,
            earned: earned,
            progress: min(progress, 1),
            mood: .forProgress(progress)
        )
    }
}
