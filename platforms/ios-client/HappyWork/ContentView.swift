import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var settings: SettingsStore
    @EnvironmentObject private var earnings: EarningsService
    @EnvironmentObject private var liveActivity: LiveActivityManager
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    rateCard
                    earningsCard
                    liveActivityCard
                }
                .padding()
            }
            .navigationTitle("打工人加油站")
        }
        // 前台每秒快照刷新时，顺带（节流）刷新 Live Activity 的金额/心情。
        .onReceive(earnings.$snapshot) { snap in
            if let session = earnings.session {
                liveActivity.update(snapshot: snap, session: session)
            }
        }
        // 切到后台前强制推一次最新快照，让锁屏显示尽量新的金额。
        .onChange(of: scenePhase) { phase in
            if phase == .background, let session = earnings.session {
                liveActivity.update(snapshot: earnings.snapshot, session: session, force: true)
            }
        }
        // 会话进行中修改时薪/年终奖 → 同步到计算与持久化。
        .onChange(of: settings.hourlyRate) { _ in syncRate() }
        .onChange(of: settings.annualBonus) { _ in syncRate() }
    }

    // MARK: - 时薪配置

    private var rateCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("当前有效时薪（含年终奖）")
                .font(.footnote).foregroundStyle(.secondary)
            HStack(alignment: .firstTextBaseline) {
                Text(String(format: "¥%.1f", settings.effectiveHourlyRate))
                    .font(.system(size: 32, weight: .bold)).monospacedDigit()
                Text("/小时").font(.footnote).foregroundStyle(.secondary)
                Spacer()
                Stepper("", value: $settings.hourlyRate, in: 0...100000, step: 10)
                    .labelsHidden()
            }

            Divider()

            labeledField(title: "基础时薪（元/小时）", value: $settings.hourlyRate)
            labeledField(title: "年终奖（税前，元/年）", value: $settings.annualBonus)
            labeledField(title: "每日工作时长（小时）", value: $settings.workdayHours)

            Text("年终奖按全年折算进时薪：默认每月 21.75 天、每天 8 小时。修改工作时长在下次开始打工时生效。")
                .font(.caption).foregroundStyle(.secondary)
        }
        .padding()
        .background(.ultraThickMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func labeledField(title: String, value: Binding<Double>) -> some View {
        HStack {
            Text(title).font(.subheadline)
            Spacer()
            TextField("0", value: value, format: .number)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .textFieldStyle(.roundedBorder)
                .frame(width: 120)
        }
    }

    // MARK: - 实时收入

    private var earningsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(earnings.isRunning ? "计薪中" : "准备开始").font(.title3.bold())

            HStack(alignment: .firstTextBaseline) {
                Text("¥\(String(format: "%.2f", earnings.snapshot.earned))")
                    .font(.system(size: 40, weight: .bold)).monospacedDigit()
                Spacer()
                Text(earnings.snapshot.mood.emoji).font(.system(size: 44))
            }

            ProgressView(value: earnings.snapshot.progress)
                .tint(.green)
                .animation(.easeInOut, value: earnings.snapshot.progress)

            HStack {
                Text("已工作 " + earnings.snapshot.elapsedString)
                Spacer()
                Text(earnings.snapshot.mood.rawValue)
            }
            .font(.callout).foregroundStyle(.secondary)

            Button(action: toggleWork) {
                Label(earnings.isRunning ? "结束打工" : "开始打工",
                      systemImage: earnings.isRunning ? "stop.fill" : "play.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    // MARK: - 锁屏实时进度

    private var liveActivityCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("锁屏实时进度").font(.headline)
            Text("开启后可在锁屏和动态岛查看进度。**已工作时长与进度条会自动走动**；收入金额是「截至上次打开 App」的快照（系统不允许后台逐秒刷新任意数字）。")
                .font(.footnote).foregroundStyle(.secondary)

            if !liveActivity.areActivitiesEnabled {
                Text("提示：请在「设置 ›（本 App）› 实时活动」中允许后再启动。")
                    .font(.caption).foregroundStyle(.orange)
            }

            HStack {
                Button(action: startLive) {
                    Label("启动", systemImage: "bolt.fill").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered).controlSize(.large)
                .disabled(!earnings.isRunning || liveActivity.isActive || !liveActivity.areActivitiesEnabled)

                Button(action: liveActivity.end) {
                    Label("结束", systemImage: "xmark.circle.fill").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered).controlSize(.large)
                .disabled(!liveActivity.isActive)
            }
        }
        .padding()
        .background(.ultraThickMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    // MARK: - Actions

    private func toggleWork() {
        if earnings.isRunning {
            earnings.stop()
            settings.activeSession = nil
            liveActivity.end()
        } else {
            let session = settings.makeSession()
            settings.activeSession = session
            earnings.start(session)
        }
    }

    private func startLive() {
        guard let session = earnings.session else { return }
        liveActivity.start(session: session, snapshot: earnings.snapshot)
    }

    private func syncRate() {
        guard earnings.isRunning else { return }
        let rate = settings.effectiveHourlyRate
        earnings.updateRate(rate)
        if var session = settings.activeSession {
            session.hourlyRate = rate
            settings.activeSession = session
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(SettingsStore())
        .environmentObject(EarningsService())
        .environmentObject(LiveActivityManager())
}
