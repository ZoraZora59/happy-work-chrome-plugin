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
    private var lastPushedPhase: WorkAttributes.WorkPhase?
    private let snapshotFreshness: TimeInterval = 60

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
                                        endDate: session.endDate,
                                        breakSegments: breakSegments(for: session))
        let content = makeContent(snapshot: snapshot, session: session)
        do {
            activity = try Activity.request(attributes: attributes, content: content, pushType: nil)
            lastPushedPhase = snapshot.phase
            isActive = true
        } catch {
            print("Live Activity 启动失败: \(error)")
        }
    }

    /// 更新金额/心情快照。前台调用时做节流（最快约 8 秒一次）；`force` 用于切后台前强制刷新。
    /// 阶段切换（进午休、到点收工）不受节流：收工那一拍之后 Timer 就停了，被吞掉会一直停在旧阶段。
    func update(snapshot: EarningsSnapshot, session: WorkSession, force: Bool = false) {
        guard let activity else { return }
        let now = Date()
        guard force || snapshot.phase != lastPushedPhase || now.timeIntervalSince(lastPush) >= 8 else { return }
        lastPush = now
        lastPushedPhase = snapshot.phase
        let content = makeContent(snapshot: snapshot, session: session)
        Task { await activity.update(content) }
    }

    /// 结束并立即移除 Live Activity。
    func end() {
        guard let activity else { return }
        Task { await activity.end(nil, dismissalPolicy: .immediate) }
        self.activity = nil
        lastPushedPhase = nil
        isActive = false
    }

    private func makeState(_ s: EarningsSnapshot) -> WorkAttributes.ContentState {
        WorkAttributes.ContentState(earned: s.earned,
                                    targetEarned: s.targetEarned,
                                    progress: s.progress,
                                    asOf: Date(),
                                    mood: s.mood.rawValue,
                                    statusTitle: s.statusTitle,
                                    isOvertime: s.isOvertime,
                                    phase: s.phase)
    }

    private func makeContent(snapshot: EarningsSnapshot, session: WorkSession) -> ActivityContent<WorkAttributes.ContentState> {
        let staleDate = min(Date().addingTimeInterval(snapshotFreshness), session.endDate)
        return ActivityContent(state: makeState(snapshot), staleDate: staleDate)
    }

    private func breakSegments(for session: WorkSession, calendar: Calendar = .current) -> [WorkAttributes.BreakSegment] {
        let total = max(session.endDate.timeIntervalSince(session.startDate), 1)
        return session.breaks.compactMap { item in
            let start = SettingsStore.date(on: session.startDate, minuteOfDay: item.startMinute, calendar: calendar)
            let end = SettingsStore.date(on: session.startDate, minuteOfDay: item.endMinute, calendar: calendar)
            let startRatio = min(max(start.timeIntervalSince(session.startDate) / total, 0), 1)
            let endRatio = min(max(end.timeIntervalSince(session.startDate) / total, 0), 1)
            guard endRatio > startRatio else { return nil }
            return WorkAttributes.BreakSegment(startRatio: startRatio, endRatio: endRatio)
        }
    }
}
