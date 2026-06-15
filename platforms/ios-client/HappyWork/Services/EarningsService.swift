import Foundation
import Combine

/// 驱动 App 内（前台）每秒的收入展示。
///
/// 注意：这个每秒 Timer 只在 App 前台有效——锁屏上的实时走动靠的是系统计时视图
/// （见 `WorkAttributes`），而不是这个 Timer。
@MainActor
final class EarningsService: ObservableObject {
    @Published private(set) var session: WorkSession?
    @Published private(set) var snapshot: EarningsSnapshot = .zero

    private var timer: Timer?

    var isRunning: Bool { session != nil }

    /// 开始一次新会话。
    func start(_ session: WorkSession) {
        self.session = session
        refresh()
        scheduleTimer()
    }

    /// App 重启后恢复进行中的会话；若已收工则只展示最终快照、不再启动 Timer。
    func resume(_ session: WorkSession) {
        self.session = session
        refresh()
        if !session.isComplete() { scheduleTimer() }
    }

    /// 结束会话。
    func stop() {
        timer?.invalidate(); timer = nil
        session = nil
        snapshot = .zero
    }

    /// 会话进行中修改时薪（例如用户中途调整了配置）后，重新计算。
    func updateRate(_ rate: Double) {
        guard var s = session else { return }
        s.hourlyRate = rate
        session = s
        refresh()
    }

    private func scheduleTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
    }

    private func refresh() {
        guard let s = session else { snapshot = .zero; return }
        let now = Date()
        snapshot = s.snapshot(at: now)
        if s.isComplete(at: now) { timer?.invalidate(); timer = nil }  // 收工后停表
    }
}
