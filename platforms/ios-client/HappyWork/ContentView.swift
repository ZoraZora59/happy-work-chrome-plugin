import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var settings: SettingsStore
    @EnvironmentObject private var earnings: EarningsService
    @EnvironmentObject private var liveActivity: LiveActivityManager
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 16) {
                    todayCard
                    incomeCard
                    scheduleCard
                    liveActivityCard
                }
                .padding()
            }
            .navigationTitle("打工人加油站")
        }
        .onReceive(earnings.$snapshot) { snap in
            if let session = earnings.session {
                liveActivity.update(snapshot: snap, session: session)
            }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .background, let session = earnings.session {
                liveActivity.update(snapshot: earnings.snapshot, session: session, force: true)
            }
        }
        .onChange(of: settings.schedulePreset) { preset in
            settings.applyPreset(preset)
        }
    }

    private var todayCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text(earnings.session == nil ? "今日待开启" : earnings.snapshot.statusTitle)
                    .font(.title3.bold())
                Spacer()
                Text(earnings.session == nil ? "🙂" : earnings.snapshot.mood.emoji)
                    .font(.system(size: 42))
            }

            HStack(alignment: .firstTextBaseline) {
                Text("¥\(String(format: "%.2f", earnings.snapshot.earned))")
                    .font(.system(size: 42, weight: .bold))
                    .monospacedDigit()
                    .minimumScaleFactor(0.7)
                Spacer()
            }

            ProgressView(value: earnings.snapshot.progress)
                .tint(.green)
                .animation(.easeInOut, value: earnings.snapshot.progress)

            HStack {
                Text("有效工作 \(earnings.snapshot.elapsedString)")
                Spacer()
                Text("目标 ¥\(String(format: "%.0f", displayedTargetEarned))")
            }
            .font(.callout)
            .foregroundStyle(.secondary)

            Text(earnings.session == nil ? "点开始后按今天作息自动补进度，并同步锁屏。" : earnings.snapshot.statusDetail)
                .font(.footnote)
                .foregroundStyle(.secondary)

            if canEnableOvertime {
                Button(action: enableOvertime) {
                    Label("我在加班，开始算加班费", systemImage: "clock.badge.exclamationmark.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }

            Button(action: toggleWork) {
                Label(primaryActionTitle, systemImage: earnings.session == nil ? "play.fill" : "stop.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var incomeCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionHeader(title: "收入", subtitle: "填月薪就够了，时薪自动折算")

            HStack(alignment: .firstTextBaseline) {
                Text(String(format: "¥%.1f", settings.effectiveHourlyRate))
                    .font(.system(size: 34, weight: .bold))
                    .monospacedDigit()
                Text("/小时")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Spacer()
            }

            labeledField(title: "月薪（税前）", value: $settings.monthlySalary)
            labeledField(title: "年终奖（可选）", value: $settings.annualBonus)
            labeledField(title: "每月计薪天数", value: $settings.monthlyPaidDays, width: 96)

            Text("按「月薪 + 年终奖/12」折算；每天有效计薪 \(String(format: "%.1f", settings.normalWorkHours)) 小时。")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(.ultraThickMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var scheduleCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionHeader(title: "作息", subtitle: "午休晚休自动扣，不用每天手动暂停")

            Picker("作息模板", selection: $settings.schedulePreset) {
                ForEach(SchedulePreset.allCases) { preset in
                    Text(preset.title).tag(preset)
                }
            }
            .pickerStyle(.segmented)

            HStack {
                DatePicker("上班", selection: minuteBinding(\.workStartMinute), displayedComponents: .hourAndMinute)
                DatePicker("下班", selection: minuteBinding(\.workEndMinute), displayedComponents: .hourAndMinute)
            }
            .labelsHidden()

            breakEditor(title: "午休",
                        isOn: $settings.lunchBreakEnabled,
                        start: minuteBinding(\.lunchStartMinute),
                        end: minuteBinding(\.lunchEndMinute))

            breakEditor(title: "晚休",
                        isOn: $settings.dinnerBreakEnabled,
                        start: minuteBinding(\.dinnerStartMinute),
                        end: minuteBinding(\.dinnerEndMinute))

            Divider()

            Toggle("下班后加班费", isOn: $settings.afterWorkOvertimeEnabled)
            labeledField(title: "加班倍数", value: $settings.afterWorkOvertimeMultiplier, width: 96)
                .disabled(!settings.afterWorkOvertimeEnabled)
        }
        .padding()
        .background(.ultraThickMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var liveActivityCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader(title: "锁屏", subtitle: liveActivity.isActive ? "已同步到锁屏和动态岛" : "点开始后自动同步")

            Text("锁屏上的金额是最近一次 App 刷新的快照；App 内收入会按休息和加班实时计算。")
                .font(.footnote)
                .foregroundStyle(.secondary)

            if !liveActivity.areActivitiesEnabled {
                Text("请在系统设置里允许本 App 使用实时活动。")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }

            if liveActivity.isActive {
                Button(action: liveActivity.end) {
                    Label("停止锁屏显示", systemImage: "xmark.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }
        }
        .padding()
        .background(.ultraThickMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var canEnableOvertime: Bool {
        guard let session = earnings.session else { return false }
        return settings.afterWorkOvertimeEnabled && Date() >= session.endDate && !session.isOvertimeActive
    }

    private var displayedTargetEarned: Double {
        guard earnings.session == nil else { return earnings.snapshot.targetEarned }
        return settings.normalWorkSeconds / 3600.0 * settings.effectiveHourlyRate
    }

    private var primaryActionTitle: String {
        guard earnings.session != nil else { return "开始打工" }
        return earnings.snapshot.isFinished ? "结束今日" : "结束打工"
    }

    private func sectionHeader(title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.headline)
            Text(subtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func labeledField(title: String, value: Binding<Double>, width: CGFloat = 120) -> some View {
        HStack {
            Text(title)
                .font(.subheadline)
            Spacer()
            TextField("0", value: value, format: .number)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .textFieldStyle(.roundedBorder)
                .frame(width: width)
        }
    }

    private func breakEditor(title: String,
                             isOn: Binding<Bool>,
                             start: Binding<Date>,
                             end: Binding<Date>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Toggle(title, isOn: isOn)
            if isOn.wrappedValue {
                HStack {
                    DatePicker("开始", selection: start, displayedComponents: .hourAndMinute)
                    DatePicker("结束", selection: end, displayedComponents: .hourAndMinute)
                }
                .labelsHidden()
            }
        }
    }

    private func minuteBinding(_ keyPath: ReferenceWritableKeyPath<SettingsStore, Int>) -> Binding<Date> {
        Binding(
            get: { SettingsStore.date(minuteOfDay: settings[keyPath: keyPath]) },
            set: {
                settings[keyPath: keyPath] = SettingsStore.minuteOfDay(from: $0)
                settings.schedulePreset = .custom
            }
        )
    }

    private func toggleWork() {
        if earnings.session != nil {
            earnings.stop()
            settings.activeSession = nil
            liveActivity.end()
        } else {
            let session = settings.makeSession()
            settings.activeSession = session
            earnings.start(session)
            liveActivity.start(session: session, snapshot: session.snapshot())
        }
    }

    private func enableOvertime() {
        guard let session = earnings.session else { return }
        let next = session.withOvertimeActive(true)
        settings.activeSession = next
        earnings.replaceSession(next)
        liveActivity.update(snapshot: next.snapshot(), session: next, force: true)
    }
}

#Preview {
    ContentView()
        .environmentObject(SettingsStore())
        .environmentObject(EarningsService())
        .environmentObject(LiveActivityManager())
}
