import Foundation

struct EarningsSnapshot: Codable, Hashable {
    let startTime: Date
    let hourlyRate: Double
    let elapsed: TimeInterval
    let earned: Double
    let moodStage: MoodStage

    enum MoodStage: String, Codable, CaseIterable {
        case calm = "冷静搬砖"
        case focus = "专注冲刺"
        case flow = "灵感爆棚"
        case tired = "需要休息"

        var emoji: String {
            switch self {
            case .calm: return "🙂"
            case .focus: return "🚀"
            case .flow: return "🔥"
            case .tired: return "😴"
            }
        }
    }
}
