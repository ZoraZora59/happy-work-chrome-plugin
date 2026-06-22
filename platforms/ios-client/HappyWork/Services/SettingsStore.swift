import Foundation
import Combine

enum SchedulePreset: String, CaseIterable, Identifiable, Codable {
    case standard965
    case long996
    case custom

    var id: String { rawValue }

    var title: String {
        switch self {
        case .standard965: return "965"
        case .long996: return "996"
        case .custom: return "自定义"
        }
    }
}

/// 每周工作制：决定一周里哪些天是休息日，并据此推算「每月计薪天数」。
/// 与「今日作息」（几点上下班）正交——作息管一天的形状，工作制管一周的节奏。
enum WorkWeekPattern: String, CaseIterable, Identifiable, Codable {
    case doubleRest   // 双休（周六、周日休息，约 5 天/周）
    case bigSmallWeek // 大小周（大周上六休一、小周双休，逐周轮换）
    case singleRest   // 单休（仅周日休息，约 6 天/周）
    case custom       // 自定义（手动勾选休息日）

    var id: String { rawValue }

    var title: String {
        switch self {
        case .doubleRest: return "双休"
        case .bigSmallWeek: return "大小周"
        case .singleRest: return "单休"
        case .custom: return "自定义"
        }
    }
}

enum AppAppearance: String, CaseIterable, Identifiable, Codable {
    case day
    case night

    var id: String { rawValue }

    var title: String {
        switch self {
        case .day: return "日间"
        case .night: return "夜间"
        }
    }

    var toggleTitle: String {
        switch self {
        case .day: return "日间"
        case .night: return "夜间"
        }
    }

    var toggleSystemImage: String {
        switch self {
        case .day: return "moon"
        case .night: return "sun.max"
        }
    }

    var next: AppAppearance {
        switch self {
        case .day: return .night
        case .night: return .day
        }
    }
}

/// 用户配置 + 进行中会话的持久化（UserDefaults），保证 App 重启后不丢。
///
/// 这里**不需要 App Group**：Widget 的所有数据都通过 Live Activity 的 ContentState
/// 传递，Widget 不直接读这里的 UserDefaults。（App Group 需要付费开发者账号配置 entitlement，
/// 留到将来需要「主屏小组件读取配置」时再加。详见 README。）
@MainActor
final class SettingsStore: ObservableObject {
    private let defaults: UserDefaults
    private enum Key {
        static let monthlySalary = "monthlySalary"
        static let annualBonus = "annualBonus"
        static let schedulePreset = "schedulePreset"
        static let workWeekPattern = "workWeekPattern"
        static let customRestWeekdays = "customRestWeekdays"
        static let bigSmallBigThisWeek = "bigSmallBigThisWeek"
        static let bigSmallAnchorDate = "bigSmallAnchorDate"
        static let workStartMinute = "workStartMinute"
        static let workEndMinute = "workEndMinute"
        static let lunchBreakEnabled = "lunchBreakEnabled"
        static let lunchStartMinute = "lunchStartMinute"
        static let lunchEndMinute = "lunchEndMinute"
        static let dinnerBreakEnabled = "dinnerBreakEnabled"
        static let dinnerStartMinute = "dinnerStartMinute"
        static let dinnerEndMinute = "dinnerEndMinute"
        static let afterWorkOvertimeEnabled = "afterWorkOvertimeEnabled"
        static let afterWorkOvertimeMultiplier = "afterWorkOvertimeMultiplier"
        static let appAppearance = "appAppearance"
        static let activeSession = "session.active"
        static let lastStoppedWork = "session.lastStopped"

        // 旧版兼容：从时薪迁移到月薪。
        static let legacyHourlyRate = "hourlyRate"
    }

    @Published var monthlySalary: Double { didSet { defaults.set(safeAmount(monthlySalary), forKey: Key.monthlySalary) } }
    @Published var annualBonus: Double { didSet { defaults.set(safeAmount(annualBonus), forKey: Key.annualBonus) } }
    @Published var schedulePreset: SchedulePreset {
        didSet { defaults.set(schedulePreset.rawValue, forKey: Key.schedulePreset) }
    }
    @Published var workWeekPattern: WorkWeekPattern {
        didSet { defaults.set(workWeekPattern.rawValue, forKey: Key.workWeekPattern) }
    }
    /// 自定义工作制下的休息日（1=周日 … 7=周六）。
    @Published var customRestWeekdays: Set<Int> {
        didSet { defaults.set(Array(customRestWeekdays).sorted(), forKey: Key.customRestWeekdays) }
    }
    /// 大小周：锚点那一周（即「本周」基准周）是不是大周。
    @Published var bigSmallBigThisWeek: Bool {
        didSet { defaults.set(bigSmallBigThisWeek, forKey: Key.bigSmallBigThisWeek) }
    }
    /// 大小周轮换的参照日（锚点周内任一时刻），用来判断目标周与锚点周的奇偶。
    @Published var bigSmallAnchorDate: Date {
        didSet { defaults.set(bigSmallAnchorDate.timeIntervalSince1970, forKey: Key.bigSmallAnchorDate) }
    }
    @Published var workStartMinute: Int { didSet { normalizeAndStoreMinute(\.workStartMinute, key: Key.workStartMinute) } }
    @Published var workEndMinute: Int { didSet { normalizeAndStoreMinute(\.workEndMinute, key: Key.workEndMinute) } }
    @Published var lunchBreakEnabled: Bool { didSet { defaults.set(lunchBreakEnabled, forKey: Key.lunchBreakEnabled) } }
    @Published var lunchStartMinute: Int { didSet { normalizeAndStoreMinute(\.lunchStartMinute, key: Key.lunchStartMinute) } }
    @Published var lunchEndMinute: Int { didSet { normalizeAndStoreMinute(\.lunchEndMinute, key: Key.lunchEndMinute) } }
    @Published var dinnerBreakEnabled: Bool { didSet { defaults.set(dinnerBreakEnabled, forKey: Key.dinnerBreakEnabled) } }
    @Published var dinnerStartMinute: Int { didSet { normalizeAndStoreMinute(\.dinnerStartMinute, key: Key.dinnerStartMinute) } }
    @Published var dinnerEndMinute: Int { didSet { normalizeAndStoreMinute(\.dinnerEndMinute, key: Key.dinnerEndMinute) } }
    @Published var afterWorkOvertimeEnabled: Bool {
        didSet { defaults.set(afterWorkOvertimeEnabled, forKey: Key.afterWorkOvertimeEnabled) }
    }
    @Published var afterWorkOvertimeMultiplier: Double {
        didSet { defaults.set(clamped(afterWorkOvertimeMultiplier, 0...5), forKey: Key.afterWorkOvertimeMultiplier) }
    }
    @Published var appAppearance: AppAppearance {
        didSet { defaults.set(appAppearance.rawValue, forKey: Key.appAppearance) }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let legacyHourlyRate = defaults.object(forKey: Key.legacyHourlyRate) as? Double
        self.monthlySalary = defaults.object(forKey: Key.monthlySalary) as? Double
            ?? (legacyHourlyRate.map { $0 * 21.75 * 8 } ?? 10000)
        self.annualBonus = defaults.object(forKey: Key.annualBonus) as? Double ?? 0
        let presetRaw = defaults.string(forKey: Key.schedulePreset) ?? SchedulePreset.standard965.rawValue
        let resolvedPreset = SchedulePreset(rawValue: presetRaw) ?? .standard965
        self.schedulePreset = resolvedPreset
        // 老用户没有工作制字段时，从既有的 965/996 套餐推断一个合理默认。
        if let storedPattern = defaults.string(forKey: Key.workWeekPattern),
           let pattern = WorkWeekPattern(rawValue: storedPattern) {
            self.workWeekPattern = pattern
        } else {
            self.workWeekPattern = resolvedPreset == .long996 ? .singleRest : .doubleRest
        }
        let storedRestDays = defaults.array(forKey: Key.customRestWeekdays) as? [Int] ?? [1, 7]
        self.customRestWeekdays = Set(storedRestDays.filter { (1...7).contains($0) })
        self.bigSmallBigThisWeek = defaults.object(forKey: Key.bigSmallBigThisWeek) as? Bool ?? true
        if let anchorInterval = defaults.object(forKey: Key.bigSmallAnchorDate) as? Double {
            self.bigSmallAnchorDate = Date(timeIntervalSince1970: anchorInterval)
        } else {
            self.bigSmallAnchorDate = Date()
        }
        self.workStartMinute = Self.normalizedMinuteOfDay(defaults.object(forKey: Key.workStartMinute) as? Int ?? 9 * 60)
        self.workEndMinute = Self.normalizedMinuteOfDay(defaults.object(forKey: Key.workEndMinute) as? Int ?? 18 * 60)
        self.lunchBreakEnabled = defaults.object(forKey: Key.lunchBreakEnabled) as? Bool ?? true
        self.lunchStartMinute = Self.normalizedMinuteOfDay(defaults.object(forKey: Key.lunchStartMinute) as? Int ?? 12 * 60)
        self.lunchEndMinute = Self.normalizedMinuteOfDay(defaults.object(forKey: Key.lunchEndMinute) as? Int ?? 13 * 60 + 30)
        self.dinnerBreakEnabled = defaults.object(forKey: Key.dinnerBreakEnabled) as? Bool ?? true
        self.dinnerStartMinute = Self.normalizedMinuteOfDay(defaults.object(forKey: Key.dinnerStartMinute) as? Int ?? 18 * 60 + 30)
        self.dinnerEndMinute = Self.normalizedMinuteOfDay(defaults.object(forKey: Key.dinnerEndMinute) as? Int ?? 19 * 60 + 30)
        self.afterWorkOvertimeEnabled = defaults.object(forKey: Key.afterWorkOvertimeEnabled) as? Bool ?? true
        self.afterWorkOvertimeMultiplier = defaults.object(forKey: Key.afterWorkOvertimeMultiplier) as? Double ?? 1.5
        let appearanceRaw = defaults.string(forKey: Key.appAppearance) ?? AppAppearance.day.rawValue
        self.appAppearance = AppAppearance(rawValue: appearanceRaw) ?? .day
    }

    var monthlyIncome: Double {
        safeAmount(monthlySalary) + safeAmount(annualBonus) / 12.0
    }

    var breaks: [WorkBreak] {
        var items: [WorkBreak] = []
        if lunchBreakEnabled {
            items.append(WorkBreak(name: "午休", startMinute: lunchStartMinute, endMinute: lunchEndMinute))
        }
        if dinnerBreakEnabled {
            items.append(WorkBreak(name: "晚休", startMinute: dinnerStartMinute, endMinute: dinnerEndMinute))
        }
        return items.filter { $0.endMinute > $0.startMinute }
    }

    var normalWorkSeconds: TimeInterval {
        let start = clampedMinute(workStartMinute)
        let end = clampedMinute(workEndMinute)
        guard end > start else { return 1 }
        let gross = TimeInterval((end - start) * 60)
        let breakSeconds = breaks.reduce(0.0) { total, item in
            total + TimeInterval(overlapMinutes(start...end, item.startMinute...item.endMinute) * 60)
        }
        return max(gross - breakSeconds, 1)
    }

    var normalWorkHours: Double {
        normalWorkSeconds / 3600.0
    }

    var scheduleSummary: String {
        var parts = ["\(Self.displayTime(workStartMinute))-\(Self.displayTime(workEndMinute))"]
        if lunchBreakEnabled {
            parts.append("午休 \(Self.displayTime(lunchStartMinute))-\(Self.displayTime(lunchEndMinute))")
        }
        if dinnerBreakEnabled {
            parts.append("晚休 \(Self.displayTime(dinnerStartMinute))-\(Self.displayTime(dinnerEndMinute))")
        }
        return parts.joined(separator: " · ")
    }

    /// 有效时薪 = (月薪 + 年终奖/12) / (当月实际计薪天数 × 每天有效计薪小时)。
    /// 计薪天数不再让用户手填——直接按「每周工作制」推算当月的实际工作天数。
    var effectiveHourlyRate: Double {
        effectiveHourlyRate(on: Date())
    }

    func effectiveHourlyRate(on date: Date, calendar: Calendar = .current) -> Double {
        let monthlyHours = paidDays(in: date, calendar: calendar) * normalWorkHours
        return monthlyHours > 0 ? monthlyIncome / monthlyHours : 0
    }

    /// 持久化的进行中会话（无则为 nil）。
    var activeSession: WorkSession? {
        get {
            guard let data = defaults.data(forKey: Key.activeSession) else { return nil }
            return try? JSONDecoder().decode(WorkSession.self, from: data)
        }
        set {
            if let newValue, let data = try? JSONEncoder().encode(newValue) {
                defaults.set(data, forKey: Key.activeSession)
            } else {
                defaults.removeObject(forKey: Key.activeSession)
            }
        }
    }

    /// 当天最近一次手动停止的会话，用于 App 重启后继续展示最终收入。
    var lastStoppedWork: StoppedWorkRecord? {
        get {
            guard let data = defaults.data(forKey: Key.lastStoppedWork) else { return nil }
            return try? JSONDecoder().decode(StoppedWorkRecord.self, from: data)
        }
        set {
            if let newValue, let data = try? JSONEncoder().encode(newValue) {
                defaults.set(data, forKey: Key.lastStoppedWork)
            } else {
                defaults.removeObject(forKey: Key.lastStoppedWork)
            }
        }
    }

    /// 只恢复同一天的停止记录；跨天后自动清理，避免把昨天收入带到今天。
    func stoppedWorkRecord(for date: Date = Date(), calendar: Calendar = .current) -> StoppedWorkRecord? {
        guard let record = lastStoppedWork else { return nil }
        guard calendar.isDate(record.stoppedAt, inSameDayAs: date) else {
            lastStoppedWork = nil
            return nil
        }
        return record
    }

    /// 给定日期是不是休息日（默认今天）。
    func isRestDay(_ date: Date = Date(), calendar: Calendar = .current) -> Bool {
        let weekday = calendar.component(.weekday, from: date)  // 1=周日 … 7=周六
        switch workWeekPattern {
        case .doubleRest:
            return weekday == 1 || weekday == 7
        case .singleRest:
            return weekday == 1
        case .bigSmallWeek:
            return isBigWeek(for: date, calendar: calendar) ? (weekday == 1)
                                                            : (weekday == 1 || weekday == 7)
        case .custom:
            return customRestWeekdays.contains(weekday)
        }
    }

    /// 目标日期所在周相对锚点周是不是大周（大周上六休一）。
    func isBigWeek(for date: Date = Date(), calendar: Calendar = .current) -> Bool {
        guard let anchorStart = calendar.dateInterval(of: .weekOfYear, for: bigSmallAnchorDate)?.start,
              let targetStart = calendar.dateInterval(of: .weekOfYear, for: date)?.start else {
            return bigSmallBigThisWeek
        }
        let days = calendar.dateComponents([.day], from: anchorStart, to: targetStart).day ?? 0
        let weeks = Int((Double(days) / 7.0).rounded())
        let isEven = ((weeks % 2) + 2) % 2 == 0
        return isEven ? bigSmallBigThisWeek : !bigSmallBigThisWeek
    }

    /// 把「本周」标记为大周或小周，并据此重置轮换锚点。
    func setBigSmallThisWeek(_ big: Bool, reference: Date = Date(), calendar: Calendar = .current) {
        bigSmallAnchorDate = calendar.dateInterval(of: .weekOfYear, for: reference)?.start ?? reference
        bigSmallBigThisWeek = big
    }

    func toggleCustomRestWeekday(_ weekday: Int) {
        guard (1...7).contains(weekday) else { return }
        if customRestWeekdays.contains(weekday) {
            customRestWeekdays.remove(weekday)
        } else {
            customRestWeekdays.insert(weekday)
        }
    }

    /// 当前「每周工作制」下，给定月份（默认本月）的实际计薪天数 = 当月非休息日的天数。
    /// 直接数日历，自动覆盖双休 / 单休 / 大小周 / 自定义，月份不同结果可能不同——
    /// 这正是用户想要的「当月实际工作天数」，不必再手填。
    func paidDays(in date: Date = Date(), calendar: Calendar = .current) -> Double {
        guard let dayRange = calendar.range(of: .day, in: .month, for: date),
              let monthStart = calendar.date(from: calendar.dateComponents([.year, .month], from: date)) else {
            return 21.75
        }
        var workdays = 0
        for offset in 0..<dayRange.count {
            guard let day = calendar.date(byAdding: .day, value: offset, to: monthStart) else { continue }
            if !isRestDay(day, calendar: calendar) { workdays += 1 }
        }
        return Double(max(workdays, 1))
    }

    /// 首页/作息页展示的一句话工作制说明。
    var workWeekSummary: String {
        let paid = Self.trimmedDays(paidDays())
        let rest: String
        switch workWeekPattern {
        case .doubleRest:
            rest = "周六、周日休息"
        case .singleRest:
            rest = "周日休息"
        case .bigSmallWeek:
            rest = isBigWeek() ? "本周大周（上六休一）" : "本周小周（双休）"
        case .custom:
            let names = customRestWeekdays.sorted().map { Self.weekdayName($0) }
            rest = names.isEmpty ? "全勤无休" : names.joined(separator: "、") + "休息"
        }
        return "\(rest) · 本月 \(paid) 天计薪"
    }

    func applyPreset(_ preset: SchedulePreset) {
        schedulePreset = preset
        switch preset {
        case .standard965:
            workWeekPattern = .doubleRest
            workStartMinute = 9 * 60
            workEndMinute = 18 * 60
            lunchBreakEnabled = true
            lunchStartMinute = 12 * 60
            lunchEndMinute = 13 * 60 + 30
            dinnerBreakEnabled = true
            dinnerStartMinute = 18 * 60 + 30
            dinnerEndMinute = 19 * 60 + 30
        case .long996:
            workWeekPattern = .singleRest
            workStartMinute = 9 * 60
            workEndMinute = 21 * 60
            lunchBreakEnabled = true
            lunchStartMinute = 12 * 60
            lunchEndMinute = 13 * 60 + 30
            dinnerBreakEnabled = true
            dinnerStartMinute = 18 * 60 + 30
            dinnerEndMinute = 19 * 60 + 30
        case .custom:
            break
        }
    }

    /// 以当前劳动规则生成今天的会话；从配置的上班时间开始，而不是从打开 App 的时刻开始。
    func makeSession(for date: Date = Date(), calendar: Calendar = .current) -> WorkSession {
        let start = Self.date(on: date, minuteOfDay: clampedMinute(workStartMinute), calendar: calendar)
        let endMinute = max(clampedMinute(workEndMinute), clampedMinute(workStartMinute) + 1)
        let end = Self.date(on: date, minuteOfDay: endMinute, calendar: calendar)
        return WorkSession(startDate: start,
                           endDate: end,
                           hourlyRate: effectiveHourlyRate,
                           overtimeMultiplier: afterWorkOvertimeMultiplier,
                           breaks: breaks,
                           isOvertimeActive: false)
    }

    private func normalizeAndStoreMinute(_ keyPath: ReferenceWritableKeyPath<SettingsStore, Int>, key: String) {
        let normalized = Self.normalizedMinuteOfDay(self[keyPath: keyPath])
        guard self[keyPath: keyPath] == normalized else {
            self[keyPath: keyPath] = normalized
            return
        }
        defaults.set(normalized, forKey: key)
    }

    static func date(on date: Date = Date(), minuteOfDay: Int, calendar: Calendar = .current) -> Date {
        let minute = clampedMinute(minuteOfDay)
        var components = calendar.dateComponents([.year, .month, .day], from: date)
        components.hour = minute / 60
        components.minute = minute % 60
        components.second = 0
        return calendar.date(from: components) ?? date
    }

    static func displayTime(_ minuteOfDay: Int) -> String {
        let minute = clampedMinute(minuteOfDay)
        return String(format: "%02d:%02d", minute / 60, minute % 60)
    }

    static func weekdayName(_ weekday: Int) -> String {
        let names = ["", "周日", "周一", "周二", "周三", "周四", "周五", "周六"]
        return (1...7).contains(weekday) ? names[weekday] : ""
    }

    static func weekdayShort(_ weekday: Int) -> String {
        let names = ["", "日", "一", "二", "三", "四", "五", "六"]
        return (1...7).contains(weekday) ? names[weekday] : ""
    }

    /// 把计薪天数格式化成最简：26 → "26"，23.8 → "23.8"，21.75 → "21.75"。
    static func trimmedDays(_ value: Double) -> String {
        let rounded = (value * 100).rounded() / 100
        if rounded == rounded.rounded() { return String(Int(rounded)) }
        if (rounded * 10).rounded() == rounded * 10 { return String(format: "%.1f", rounded) }
        return String(format: "%.2f", rounded)
    }

    /// 时间一律对齐到 5 分钟刻度——和原生时间滚轮的 `minuteInterval` 保持一致，
    /// 手指好对齐，作息也更整洁。
    static let minuteStep = 5

    static func normalizedMinuteOfDay(_ value: Int) -> Int {
        let snapped = Int((Double(clampedMinute(value)) / Double(minuteStep)).rounded()) * minuteStep
        return clampedMinute(snapped)
    }

    static func minuteOfDay(from date: Date, calendar: Calendar = .current) -> Int {
        let components = calendar.dateComponents([.hour, .minute], from: date)
        return normalizedMinuteOfDay((components.hour ?? 0) * 60 + (components.minute ?? 0))
    }
}

private func safeAmount(_ value: Double) -> Double {
    value.isFinite ? max(value, 0) : 0
}

private func clamped(_ value: Double, _ range: ClosedRange<Double>) -> Double {
    guard value.isFinite else { return range.lowerBound }
    return min(max(value, range.lowerBound), range.upperBound)
}

private func clampedMinute(_ value: Int) -> Int {
    min(max(value, 0), 23 * 60 + 59)
}

private func overlapMinutes(_ first: ClosedRange<Int>, _ second: ClosedRange<Int>) -> Int {
    let start = max(first.lowerBound, second.lowerBound)
    let end = min(first.upperBound, second.upperBound)
    return max(0, end - start)
}
