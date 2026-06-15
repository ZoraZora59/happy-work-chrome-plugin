import ActivityKit
import Foundation

/// 创建 / 更新 / 重连 / 结束 锁屏与动态岛的 Live Activity。
///
/// **仅使用本地更新（不走推送）**，因此不需要 APNs entitlement，也就**不需要付费开发者
/// 账号**即可在模拟器/真机上运行。若将来要让锁屏金额逐秒跳动，则需改为推送驱动
/// （pushType: .token + 服务端），那时才需要付费账号。详见 README。
@MainActor
final class LiveActivityManager: ObservableObject {
    @Published private(set) var isActive = false

    private var activity: Activity<WorkAttributes>?
    private var lastPush: Date = .distantPast

    /// 用户是否在系统设置里为本 App 打开了「实时活动」。
    var areActivitiesEnabled: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    /// App 重启后重新接管仍存活的 Live Activity。
    func restore() {
        activity = Activity<WorkAttributes>.activities.first
        isActive = activity != nil
    }

    /// 启动一个 Live Activity。
    func start(session: WorkSession, snapshot: EarningsSnapshot) {
        guard areActivitiesEnabled else { return }
        guard activity == nil else { return }  // 避免重复创建
        let attributes = WorkAttributes(hourlyRate: session.hourlyRate,
                                        startDate: session.startDate,
                                        endDate: session.endDate)
        let content = ActivityContent(state: makeState(snapshot), staleDate: session.endDate)
        do {
            activity = try Activity.request(attributes: attributes, content: content, pushType: nil)
            isActive = true
        } catch {
            print("Live Activity 启动失败: \(error)")
        }
    }

    /// 更新金额/心情快照。前台调用时做节流（最快约 8 秒一次）；`force` 用于切后台前强制刷新。
    func update(snapshot: EarningsSnapshot, session: WorkSession, force: Bool = false) {
        guard let activity else { return }
        let now = Date()
        guard force || now.timeIntervalSince(lastPush) >= 8 else { return }
        lastPush = now
        let content = ActivityContent(state: makeState(snapshot), staleDate: session.endDate)
        Task { await activity.update(content) }
    }

    /// 结束并立即移除 Live Activity。
    func end() {
        guard let activity else { return }
        Task { await activity.end(nil, dismissalPolicy: .immediate) }
        self.activity = nil
        isActive = false
    }

    private func makeState(_ s: EarningsSnapshot) -> WorkAttributes.ContentState {
        WorkAttributes.ContentState(earned: s.earned, asOf: Date(),
                                    mood: s.mood.rawValue, emoji: s.mood.emoji)
    }
}
