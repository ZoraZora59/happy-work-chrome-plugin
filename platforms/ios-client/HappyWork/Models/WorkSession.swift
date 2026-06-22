import Foundation

struct WorkBreak: Codable, Equatable, Identifiable {
    var id: String { "\(name)-\(startMinute)-\(endMinute)" }
    var name: String
    var startMinute: Int
    var endMinute: Int
}

/// 一次打工时段。`startDate...endDate` 既驱动 App 内的每秒计算，也作为 Live Activity
/// 的属性传给 Widget。App 内的收入计算会扣除休息时间；锁屏计时视图展示的是日程进度。
struct WorkSession: Codable, Equatable {
    var startDate: Date
    var endDate: Date
    var hourlyRate: Double
    var overtimeMultiplier: Double
    var breaks: [WorkBreak]
    var isOvertimeActive: Bool

    var duration: TimeInterval { max(endDate.timeIntervalSince(startDate), 1) }

    /// 正常上班时段内的有效计薪秒数，扣除午休/晚休等休息段。
    var plannedPaidSeconds: TimeInterval {
        paidSeconds(from: startDate, to: endDate)
    }

    func isComplete(at now: Date = Date()) -> Bool {
        now >= endDate && !isOvertimeActive
    }

    func withOvertimeActive(_ active: Bool) -> WorkSession {
        var copy = self
        copy.isOvertimeActive = active
        return copy
    }

    /// 计算 `now` 时刻的收入快照。正常收入扣除休息时间；加班收入按倍数计算。
    func snapshot(at now: Date = Date()) -> EarningsSnapshot {
        let normalEnd = min(maxDate(now, startDate), endDate)
        let normalSeconds = paidSeconds(from: startDate, to: normalEnd)
        let overtimeSeconds = isOvertimeActive && now > endDate ? paidSeconds(from: endDate, to: now) : 0
        let elapsed = normalSeconds + overtimeSeconds
        let normalEarned = normalSeconds / 3600.0 * hourlyRate
        let overtimeEarned = overtimeSeconds / 3600.0 * hourlyRate * overtimeMultiplier
        let progress = plannedPaidSeconds > 0 ? normalSeconds / plannedPaidSeconds : 0
        let cappedProgress = min(max(progress, 0), 1)
        let isBeforeWork = now < startDate
        let isOnBreak = containsBreak(at: now)
        let isFinished = now >= endDate && !isOvertimeActive
        let isOvertime = isOvertimeActive && now >= endDate
        return EarningsSnapshot(
            elapsed: elapsed,
            normalElapsed: normalSeconds,
            overtimeElapsed: overtimeSeconds,
            plannedElapsed: plannedPaidSeconds,
            earned: normalEarned + overtimeEarned,
            targetEarned: plannedPaidSeconds / 3600.0 * hourlyRate,
            progress: cappedProgress,
            mood: .forProgress(cappedProgress),
            isBeforeWork: isBeforeWork,
            isOnBreak: isOnBreak,
            isFinished: isFinished,
            isOvertime: isOvertime
        )
    }

    private func paidSeconds(from start: Date, to end: Date) -> TimeInterval {
        guard end > start else { return 0 }
        var seconds = end.timeIntervalSince(start)
        for item in breaks {
            let breakStart = date(on: start, minuteOfDay: item.startMinute)
            let breakEnd = date(on: start, minuteOfDay: item.endMinute)
            seconds -= overlapSeconds(start...end, breakStart...breakEnd)
        }
        return max(seconds, 0)
    }

    private func containsBreak(at date: Date) -> Bool {
        breaks.contains { item in
            let start = self.date(on: date, minuteOfDay: item.startMinute)
            let end = self.date(on: date, minuteOfDay: item.endMinute)
            return date >= start && date < end
        }
    }

    private func date(on date: Date, minuteOfDay: Int, calendar: Calendar = .current) -> Date {
        var components = calendar.dateComponents([.year, .month, .day], from: date)
        components.hour = minuteOfDay / 60
        components.minute = minuteOfDay % 60
        components.second = 0
        return calendar.date(from: components) ?? date
    }

    private func overlapSeconds(_ first: ClosedRange<Date>, _ second: ClosedRange<Date>) -> TimeInterval {
        let start = maxDate(first.lowerBound, second.lowerBound)
        let end = minDate(first.upperBound, second.upperBound)
        return max(end.timeIntervalSince(start), 0)
    }
}

/// 已结束的打工记录。保留原会话与停止时间，便于重启 App 后还原当天最终收入快照。
struct StoppedWorkRecord: Codable, Equatable {
    var session: WorkSession
    var stoppedAt: Date

    var snapshot: EarningsSnapshot {
        session.snapshot(at: stoppedAt)
    }
}

private func maxDate(_ first: Date, _ second: Date) -> Date {
    first >= second ? first : second
}

private func minDate(_ first: Date, _ second: Date) -> Date {
    first <= second ? first : second
}
