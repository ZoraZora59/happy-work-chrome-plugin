import Foundation
import Combine

/// 用户配置 + 进行中会话的持久化（UserDefaults），保证 App 重启后不丢。
///
/// 这里**不需要 App Group**：Widget 的所有数据都通过 Live Activity 的 ContentState
/// 传递，Widget 不直接读这里的 UserDefaults。（App Group 需要付费开发者账号配置 entitlement，
/// 留到将来需要「主屏小组件读取配置」时再加。详见 README。）
@MainActor
final class SettingsStore: ObservableObject {
    private let defaults: UserDefaults
    private enum Key {
        static let hourlyRate = "hourlyRate"
        static let annualBonus = "annualBonus"
        static let workdayHours = "workdayHours"
        static let sessionStart = "session.start"
        static let sessionEnd = "session.end"
        static let sessionRate = "session.rate"
    }

    @Published var hourlyRate: Double { didSet { defaults.set(hourlyRate, forKey: Key.hourlyRate) } }
    @Published var annualBonus: Double { didSet { defaults.set(annualBonus, forKey: Key.annualBonus) } }
    @Published var workdayHours: Double { didSet { defaults.set(workdayHours, forKey: Key.workdayHours) } }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.hourlyRate = defaults.object(forKey: Key.hourlyRate) as? Double ?? 50
        self.annualBonus = defaults.object(forKey: Key.annualBonus) as? Double ?? 0
        self.workdayHours = defaults.object(forKey: Key.workdayHours) as? Double ?? 8
    }

    /// 折算年终奖用的标准月工时：21.75 工作日/月 × 8 小时/日 ≈ 174 小时/月。
    private let standardMonthlyWorkHours: Double = 21.75 * 8

    /// 有效时薪 = 基础时薪 + 年终奖按「全年」折算到每小时的部分。
    /// 年终奖是**一年一次**，所以要先 /12 折成每月，再 / 月工时折成每小时。
    /// （旧实现写成 `annualBonus / 月工时`，漏了 /12，会把时薪高估 12 倍，这里已修正。）
    var effectiveHourlyRate: Double {
        max(0, hourlyRate + annualBonus / 12.0 / standardMonthlyWorkHours)
    }

    /// 持久化的进行中会话（无则为 nil）。
    var activeSession: WorkSession? {
        get {
            guard let start = defaults.object(forKey: Key.sessionStart) as? Date,
                  let end = defaults.object(forKey: Key.sessionEnd) as? Date else { return nil }
            let rate = defaults.object(forKey: Key.sessionRate) as? Double ?? effectiveHourlyRate
            return WorkSession(startDate: start, endDate: end, hourlyRate: rate)
        }
        set {
            if let s = newValue {
                defaults.set(s.startDate, forKey: Key.sessionStart)
                defaults.set(s.endDate, forKey: Key.sessionEnd)
                defaults.set(s.hourlyRate, forKey: Key.sessionRate)
            } else {
                defaults.removeObject(forKey: Key.sessionStart)
                defaults.removeObject(forKey: Key.sessionEnd)
                defaults.removeObject(forKey: Key.sessionRate)
            }
        }
    }

    /// 以当前配置生成一个从 `start` 开始、时长为 `workdayHours` 的新会话。
    func makeSession(startingAt start: Date = Date()) -> WorkSession {
        let seconds = max(workdayHours, 0.1) * 3600
        return WorkSession(startDate: start,
                           endDate: start.addingTimeInterval(seconds),
                           hourlyRate: effectiveHourlyRate)
    }
}
