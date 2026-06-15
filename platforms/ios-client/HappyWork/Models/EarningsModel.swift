import Foundation

/// 心情阶段：按当天工作进度（0...1）映射，进度越高越亢奋，收工时「收获满满」。
enum MoodStage: String, Codable, CaseIterable {
    case calm = "冷静搬砖"
    case focus = "专注冲刺"
    case flow = "灵感爆棚"
    case harvest = "收获满满"

    var emoji: String {
        switch self {
        case .calm: return "🙂"
        case .focus: return "🚀"
        case .flow: return "🔥"
        case .harvest: return "🤩"
        }
    }

    /// 按完成进度（0...1）映射心情阶段。
    static func forProgress(_ progress: Double) -> MoodStage {
        switch progress {
        case ..<0.33: return .calm
        case ..<0.66: return .focus
        case ..<1.0: return .flow
        default: return .harvest
        }
    }
}

/// 当前收入状态的快照，App 在前台时每秒刷新一次（用于 App 内展示）。
struct EarningsSnapshot: Equatable {
    var elapsed: TimeInterval
    var earned: Double
    var progress: Double
    var mood: MoodStage

    static let zero = EarningsSnapshot(elapsed: 0, earned: 0, progress: 0, mood: .calm)

    /// "mm:ss" 或 "h:mm:ss" 形式的已工作时长。
    var elapsedString: String {
        let total = Int(elapsed)
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s)
                     : String(format: "%02d:%02d", m, s)
    }
}
