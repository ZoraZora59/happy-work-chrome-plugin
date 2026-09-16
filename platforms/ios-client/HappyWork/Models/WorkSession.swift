import Foundation

struct WorkBreak: Codable, Equatable, Identifiable {
    var id: String { "\(name)-\(startMinute)-\(endMinute)" }
    var name: String
    var startMinute: Int
    var endMinute: Int
}

extension WorkBreak {
    /// 把休息段合并成互不重叠的分钟区间（按开始时间排序）。午休/晚休有交叠时若逐段相减，
    /// 交叠部分会被扣两次，已赚金额会在交叠期倒退。
    static func mergedMinuteRanges(_ breaks: [WorkBreak]) -> [ClosedRange<Int>] {
        var merged: [ClosedRange<Int>] = []
        for item in breaks.sorted(by: { $0.startMinute < $1.startMinute }) where item.endMinute > item.startMinute {
            if let last = merged.last, item.startMinute <= last.upperBound {
                merged[merged.count - 1] = last.lowerBound...max(last.upperBound, item.endMinute)
            } else {
                merged.append(item.startMinute...item.endMinute)
            }
        }
        return merged
    }
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

    /// 会话所在自然日的结束时刻（次日 0 点）。加班最多算到这里：忘记停止时不会跨天无限累计，
    /// Timer 也能按时停表。
    var dayEndDate: Date {
        let calendar = Calendar.current
        return calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: startDate))
            ?? startDate.addingTimeInterval(24 * 3600)
    }

    func isComplete(at now: Date = Date()) -> Bool {
        guard now >= endDate else { return false }
        return !isOvertimeActive || now >= dayEndDate
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
        let dayEnd = dayEndDate
        let overtimeEnd = min(now, dayEnd)
        let overtimeSeconds = isOvertimeActive && overtimeEnd > endDate ? paidSeconds(from: endDate, to: overtimeEnd) : 0
        let planned = plannedPaidSeconds  // 会话内恒定，只算一次
        let elapsed = normalSeconds + overtimeSeconds
        let normalEarned = normalSeconds / 3600.0 * hourlyRate
        let overtimeEarned = overtimeSeconds / 3600.0 * hourlyRate * overtimeMultiplier
        let progress = planned > 0 ? normalSeconds / planned : 0
        let cappedProgress = min(max(progress, 0), 1)
        let isBeforeWork = now < startDate
        let isOnBreak = containsBreak(at: now)
        let isFinished = now >= endDate && (!isOvertimeActive || now >= dayEnd)
        let isOvertime = isOvertimeActive && now >= endDate && now < dayEnd
        return EarningsSnapshot(
            elapsed: elapsed,
            normalElapsed: normalSeconds,
            overtimeElapsed: overtimeSeconds,
            plannedElapsed: planned,
            earned: normalEarned + overtimeEarned,
            targetEarned: planned / 3600.0 * hourlyRate,
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
        for range in WorkBreak.mergedMinuteRanges(breaks) {
            let breakStart = date(on: start, minuteOfDay: range.lowerBound)
            let breakEnd = date(on: start, minuteOfDay: range.upperBound)
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
