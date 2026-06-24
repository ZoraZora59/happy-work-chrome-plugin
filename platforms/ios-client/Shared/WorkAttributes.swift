import ActivityKit
import Foundation

/// Live Activity 属性，**App 与 Widget Extension 共用**（project.yml 中此文件同时
/// 加入两个 target 的 sources）。
///
/// 设计要点（决定了锁屏实时性的边界）：
/// - `startDate`/`endDate` 定义本次打工时段。Widget 用这个区间配合
///   `Text(timerInterval:)` 和 `ProgressView(timerInterval:)` 渲染日程进度——它会在锁屏
///   自动走动，即使 App 没有运行。午休/晚休扣除和加班费只在 App 内计算。
/// - 收入金额（`ContentState.earned`）是系统无法插值的任意数字，因此它是一个
///   **快照**：只在 App（或推送）调用 update 时刷新。详见 README「锁屏实时性的边界」。
struct WorkAttributes: ActivityAttributes {
    public struct BreakSegment: Codable, Hashable {
        var startRatio: Double
        var endRatio: Double
    }

    /// 打工阶段。锁屏/动态岛据此切换「状态小人」插画。
    ///
    /// 与金额同理：阶段判定需要每秒重算，系统无法在锁屏上自行推进，因此它也是**快照**——
    /// 锁屏无推送时会冻结在上次 update 的阶段（例如进了午休但不会自动切到 `.onBreak`）。
    /// 由 App 侧用 `EarningsSnapshot` 的布尔状态算出（见 `LiveActivityManager`），
    /// 避免在 Widget 里硬匹配 App-only 的中文 `statusTitle` 字面量。
    public enum WorkPhase: String, Codable, Hashable {
        case beforeWork   // 还没上班
        case working      // 计薪中
        case onBreak      // 休息中
        case overtime     // 加班中
        case finished     // 今日已收工

        /// 自定义小人插画的 asset 名称（矢量图在 `HappyWorkWidget/Assets.xcassets`）。
        /// 锁屏卡片与动态岛展开区用这套插画。
        var assetName: String { "phase-\(rawValue)" }

        /// 兜底 SF Symbol。动态岛**紧凑区**尺寸太小（~16pt），插画糊成一团，
        /// 那里仍用符号；插画资源缺失时也可回退到它。
        var symbolName: String {
            switch self {
            case .beforeWork: return "bed.double.fill"
            case .working:    return "figure.walk"
            case .onBreak:    return "cup.and.saucer.fill"
            case .overtime:   return "flame.fill"
            case .finished:   return "checkmark.seal.fill"
            }
        }
    }

    public struct ContentState: Codable, Hashable {
        /// `asOf` 时刻已赚取金额（元）。下次 update 前保持不变。
        var earned: Double
        /// 当天正常工时目标收入（元）。
        var targetEarned: Double
        /// 已完成的有效计薪进度（0...1）。
        var progress: Double
        /// `earned` 的采样时刻。
        var asOf: Date
        /// `asOf` 时刻的心情阶段名称。
        var mood: String
        /// App 内同一套状态标题。
        var statusTitle: String
        /// 是否已进入加班计薪。
        var isOvertime: Bool
        /// 当前打工阶段，用于切换状态小人插画。同为快照，锁屏无推送时冻结。
        var phase: WorkPhase
    }

    /// 有效时薪（由月薪、年终奖、计薪天数、有效工时折算），元/小时。
    var hourlyRate: Double
    /// 打工时段开始时间。
    var startDate: Date
    /// 打工时段结束时间（= startDate + 工作时长），保证 > startDate。
    var endDate: Date
    /// 休息段在日程轨道上的比例，用于锁屏展示午休/晚休断点。
    var breakSegments: [BreakSegment]
}

extension WorkAttributes {
    /// 供系统计时视图使用的安全日期区间（防止 start >= end 触发崩溃）。
    var timerRange: ClosedRange<Date> {
        endDate > startDate ? startDate...endDate : startDate...startDate.addingTimeInterval(1)
    }
}
