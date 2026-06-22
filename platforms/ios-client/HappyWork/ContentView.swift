import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var settings: SettingsStore
    @EnvironmentObject private var earnings: EarningsService
    @EnvironmentObject private var liveActivity: LiveActivityManager
    @Environment(\.scenePhase) private var scenePhase

    @State private var isScheduleSheetPresented = false
    @State private var isIncomeSheetPresented = false

    private var theme: DashboardTheme { DashboardTheme(appearance: settings.appAppearance) }

    var body: some View {
        ZStack {
            theme.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 18) {
                    header
                    cockpitPanel
                    scheduleSummary
                    incomeSummary
                    liveActivityPreview
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 30)
            }
            .scrollIndicators(.hidden)
        }
        .preferredColorScheme(settings.appAppearance == .night ? .dark : .light)
        .sheet(isPresented: $isScheduleSheetPresented) {
            ScheduleSettingsSheet(theme: theme)
                .environmentObject(settings)
                .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $isIncomeSheetPresented) {
            IncomeSettingsSheet(theme: theme)
                .environmentObject(settings)
                .presentationDetents([.medium])
        }
        .onReceive(earnings.$snapshot) { snap in
            if let session = earnings.session {
                liveActivity.update(snapshot: snap, session: session)
            }
        }
        .onChange(of: scenePhase) { phase in
            if (phase == .active || phase == .background), let session = earnings.session {
                liveActivity.update(snapshot: earnings.snapshot, session: session, force: true)
            }
        }
        .onChange(of: settings.schedulePreset) { preset in
            settings.applyPreset(preset)
        }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text("HappyWork")
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundStyle(theme.primaryText)
                Text(Date(), format: .dateTime.month().day().weekday(.wide))
                    .font(.subheadline)
                    .foregroundStyle(theme.secondaryText)
            }

            Spacer()

            Button {
                settings.appAppearance = settings.appAppearance.next
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: settings.appAppearance.toggleSystemImage)
                    Text(settings.appAppearance.toggleTitle)
                }
                .font(.caption.bold())
                .foregroundStyle(theme.primaryText)
                .padding(.horizontal, 11)
                .padding(.vertical, 8)
                .background(theme.surface, in: Capsule())
            }
            .buttonStyle(.plain)

            Button {
                isIncomeSheetPresented = true
            } label: {
                Image(systemName: "gearshape")
                    .font(.headline)
                    .foregroundStyle(theme.primaryText)
                    .frame(width: 36, height: 36)
                    .background(theme.surface, in: Circle())
            }
            .buttonStyle(.plain)
        }
    }

    private var cockpitPanel: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    StatusPill(title: statusTitle, theme: theme, isOvertime: earnings.snapshot.isOvertime)
                    Text("今天已赚")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(theme.secondaryText)
                    Text("¥\(String(format: "%.2f", earnings.snapshot.earned))")
                        .font(.system(size: 44, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.55)
                        .allowsTightening(true)
                        .foregroundStyle(theme.primaryText)
                }
                .layoutPriority(1)

                Spacer(minLength: 10)

                CountdownBlock(title: countdownTitle,
                               value: countdownValue,
                               theme: theme)
            }

            VStack(alignment: .leading, spacing: 8) {
                SegmentedScheduleProgressView(progress: currentProgress,
                                              workStartMinute: settings.workStartMinute,
                                              workEndMinute: settings.workEndMinute,
                                              breaks: settings.breaks,
                                              theme: theme)
                Text("午休晚休已自动扣除")
                    .font(.caption)
                    .foregroundStyle(theme.secondaryText)
            }

            Text(statusLine)
                .font(.headline)
                .foregroundStyle(theme.primaryText)

            HStack(spacing: 8) {
                MetricChip(title: "月薪", value: salaryText, theme: theme)
                MetricChip(title: "有效计薪", value: settings.normalWorkHours.hoursAsHourMinuteText, theme: theme)
                MetricChip(title: "目标", value: "¥\(String(format: "%.0f", displayedTargetEarned))", theme: theme)
            }

            VStack(spacing: 10) {
                Button(action: toggleWork) {
                    Label(primaryActionTitle, systemImage: earnings.session == nil ? "play.fill" : "stop.fill")
                        .font(.headline)
                        .foregroundStyle(theme.primaryButtonText)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(theme.accent, in: Capsule())
                }
                .buttonStyle(.plain)

                if canEnableOvertime {
                    Button(action: enableOvertime) {
                        Label("开启加班费 \(String(format: "%.1fx", settings.afterWorkOvertimeMultiplier))",
                              systemImage: "bolt.fill")
                            .font(.subheadline.bold())
                            .foregroundStyle(theme.overtime)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(theme.overtime.opacity(0.14), in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(20)
        .background(theme.heroSurface, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(theme.border, lineWidth: 1)
        }
    }

    private var scheduleSummary: some View {
        Button {
            isScheduleSheetPresented = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "calendar.badge.clock")
                    .font(.headline)
                    .foregroundStyle(theme.blue)
                    .frame(width: 36, height: 36)
                    .background(theme.blue.opacity(0.13), in: Circle())

                VStack(alignment: .leading, spacing: 4) {
                    Text("今日作息")
                        .font(.subheadline.bold())
                        .foregroundStyle(theme.primaryText)
                    Text(settings.scheduleSummary)
                        .font(.caption)
                        .foregroundStyle(theme.secondaryText)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption.bold())
                    .foregroundStyle(theme.secondaryText)
            }
            .padding(16)
            .background(theme.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var incomeSummary: some View {
        Button {
            isIncomeSheetPresented = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "banknote")
                    .font(.headline)
                    .foregroundStyle(theme.accent)
                    .frame(width: 36, height: 36)
                    .background(theme.accent.opacity(0.13), in: Circle())

                VStack(alignment: .leading, spacing: 4) {
                    Text("收入规则")
                        .font(.subheadline.bold())
                        .foregroundStyle(theme.primaryText)
                    Text("时薪 ¥\(String(format: "%.1f", settings.effectiveHourlyRate)) · 加班 \(String(format: "%.1fx", settings.afterWorkOvertimeMultiplier))")
                        .font(.caption)
                        .foregroundStyle(theme.secondaryText)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption.bold())
                    .foregroundStyle(theme.secondaryText)
            }
            .padding(16)
            .background(theme.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var liveActivityPreview: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("锁屏预览")
                        .font(.headline)
                        .foregroundStyle(theme.primaryText)
                    Text(liveActivity.isActive ? "已同步到锁屏和动态岛" : "点开始后自动同步")
                        .font(.caption)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .foregroundStyle(theme.secondaryText)
                }
                .layoutPriority(1)

                Spacer()

                compactLiveActivityPreview

                if liveActivity.isActive {
                    Button(action: liveActivity.end) {
                        Image(systemName: "stop.circle.fill")
                            .font(.title3)
                            .foregroundStyle(theme.overtime)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("停止锁屏实时活动")
                }
            }

            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("¥\(String(format: "%.2f", earnings.snapshot.earned))")
                        .font(.title3.bold())
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .foregroundStyle(.white)
                    Spacer()
                    Text(lockCountdownText)
                        .font(.caption.bold())
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .foregroundStyle(LockPreviewPalette.secondary)
                }

                SegmentedScheduleProgressView(progress: currentProgress,
                                              workStartMinute: settings.workStartMinute,
                                              workEndMinute: settings.workEndMinute,
                                              breaks: settings.breaks,
                                              theme: .lockPreview)

                HStack {
                    Text(statusTitle)
                    Spacer()
                    Text(earnings.snapshot.isOvertime ? "加班费已开启" : "\(SettingsStore.displayTime(settings.workEndMinute)) 后可算加班费")
                        .foregroundStyle(earnings.snapshot.isOvertime ? LockPreviewPalette.overtime : LockPreviewPalette.secondary)
                }
                .font(.caption)
                .foregroundStyle(LockPreviewPalette.secondary)
            }
            .padding(16)
            .background(LockPreviewPalette.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))

            if !liveActivity.areActivitiesEnabled {
                Text("请在系统设置里允许本 App 使用实时活动。")
                    .font(.caption)
                    .foregroundStyle(theme.overtime)
            }
        }
        .padding(16)
        .background(theme.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var compactLiveActivityPreview: some View {
        HStack(spacing: 8) {
            Text("¥\(String(format: "%.0f", earnings.snapshot.earned))")
            Capsule()
                .fill(LockPreviewPalette.accent)
                .frame(width: 30, height: 5)
            Text(countdownValue)
        }
        .font(.caption.bold())
        .foregroundStyle(.white)
        .lineLimit(1)
        .minimumScaleFactor(0.75)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.black, in: Capsule())
        .accessibilityLabel("动态岛预览，已赚 \(String(format: "%.0f", earnings.snapshot.earned)) 元，剩余 \(countdownValue)")
    }

    private var statusTitle: String {
        earnings.session == nil ? "待开启" : earnings.snapshot.statusTitle
    }

    private var statusLine: String {
        if earnings.session == nil { return "今天的班，还没开始计薪" }
        if earnings.snapshot.isOvertime { return "加班费正在按倍数累计" }
        if earnings.snapshot.isFinished { return "今天的正常工时已完成" }
        if earnings.snapshot.isOnBreak { return "休息中，不计薪" }
        if earnings.snapshot.progress >= 0.5 { return "今天的班，已经过半" }
        return "先把上午稳稳拿下"
    }

    private var currentProgress: Double {
        earnings.session == nil ? 0 : earnings.snapshot.progress
    }

    private var salaryText: String {
        let value = settings.monthlySalary
        return value >= 10000 ? "\(String(format: "%.1f", value / 10000))万" : String(format: "%.0f", value)
    }

    private var countdownTitle: String {
        if earnings.session == nil && Date() >= settings.makeSession().endDate { return "已到下班时间" }
        if earnings.session == nil { return "距下班还有" }
        if earnings.snapshot.isOvertime { return "已加班" }
        if earnings.snapshot.isFinished { return "已到下班时间" }
        return "距下班还有"
    }

    private var countdownValue: String {
        let session = earnings.session ?? settings.makeSession()
        if earnings.session == nil && Date() >= session.endDate { return "今天" }
        if earnings.snapshot.isFinished { return "今天" }
        if earnings.snapshot.isOvertime {
            return WorkDurationFormatter.readableCountdown(earnings.snapshot.overtimeElapsed)
        }
        let remaining = max(session.endDate.timeIntervalSince(Date()), 0)
        return WorkDurationFormatter.readableCountdown(remaining)
    }

    private var lockCountdownText: String {
        if earnings.session == nil && Date() >= settings.makeSession().endDate {
            return "今天已到下班点"
        }
        if earnings.snapshot.isFinished { return "今天已到下班点" }
        if earnings.snapshot.isOvertime { return "加班中" }
        return "\(countdownValue) 后下班"
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

private struct ScheduleSettingsSheet: View {
    @EnvironmentObject private var settings: SettingsStore
    @Environment(\.dismiss) private var dismiss

    var theme: DashboardTheme

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Picker("作息模板", selection: $settings.schedulePreset) {
                        ForEach(SchedulePreset.allCases) { preset in
                            Text(preset.title).tag(preset)
                        }
                    }
                    .pickerStyle(.segmented)

                    VStack(spacing: 18) {
                        TimeQuickEditor(title: "上班", minute: scheduleMinuteBinding(\.workStartMinute), theme: theme)
                        TimeQuickEditor(title: "下班", minute: scheduleMinuteBinding(\.workEndMinute), theme: theme)
                    }

                    VStack(alignment: .leading, spacing: 14) {
                        Text("休息自动扣除")
                            .font(.headline)
                            .foregroundStyle(theme.primaryText)

                        BreakQuickEditor(title: "午休",
                                         isOn: $settings.lunchBreakEnabled,
                                         start: scheduleMinuteBinding(\.lunchStartMinute),
                                         end: scheduleMinuteBinding(\.lunchEndMinute),
                                         theme: theme)

                        BreakQuickEditor(title: "晚休",
                                         isOn: $settings.dinnerBreakEnabled,
                                         start: scheduleMinuteBinding(\.dinnerStartMinute),
                                         end: scheduleMinuteBinding(\.dinnerEndMinute),
                                         theme: theme)
                    }

                    Button {
                        settings.applyPreset(.standard965)
                    } label: {
                        Text("恢复默认")
                            .font(.subheadline.bold())
                            .foregroundStyle(theme.secondaryText)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 13)
                            .background(theme.surface, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
                .padding(20)
            }
            .background(theme.background)
            .navigationTitle("调整今日作息")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") { dismiss() }
                        .fontWeight(.bold)
                }
            }
            .preferredColorScheme(theme.appearance == .night ? .dark : .light)
        }
    }

    private func scheduleMinuteBinding(_ keyPath: ReferenceWritableKeyPath<SettingsStore, Int>) -> Binding<Int> {
        Binding(
            get: { settings[keyPath: keyPath] },
            set: { value in
                settings[keyPath: keyPath] = SettingsStore.normalizedMinuteOfDay(value)
                settings.schedulePreset = .custom
            }
        )
    }
}

private struct IncomeSettingsSheet: View {
    @EnvironmentObject private var settings: SettingsStore
    @Environment(\.dismiss) private var dismiss

    var theme: DashboardTheme

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                Text("填月薪就够了，时薪会按作息自动折算。")
                    .font(.subheadline)
                    .foregroundStyle(theme.secondaryText)

                VStack(spacing: 14) {
                    MoneyField(title: "月薪（税前）", value: $settings.monthlySalary, theme: theme)
                    MoneyField(title: "年终奖（可选）", value: $settings.annualBonus, theme: theme)
                    NumberField(title: "每月计薪天数", value: $settings.monthlyPaidDays, theme: theme)
                }

                Divider()

                Toggle("下班后加班费", isOn: $settings.afterWorkOvertimeEnabled)
                    .font(.headline)
                NumberField(title: "加班倍数", value: $settings.afterWorkOvertimeMultiplier, theme: theme)
                    .disabled(!settings.afterWorkOvertimeEnabled)
                    .opacity(settings.afterWorkOvertimeEnabled ? 1 : 0.45)

                Spacer()
            }
            .padding(20)
            .background(theme.background)
            .navigationTitle("收入规则")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") { dismiss() }
                        .fontWeight(.bold)
                }
            }
            .preferredColorScheme(theme.appearance == .night ? .dark : .light)
        }
    }
}

private struct TimeQuickEditor: View {
    var title: String
    @Binding var minute: Int
    var theme: DashboardTheme

    private var hourBinding: Binding<Int> {
        Binding(
            get: { minute / 60 },
            set: { minute = SettingsStore.minuteOfDay(hour: $0, minuteComponent: minute % 60) }
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(theme.primaryText)
                Spacer()
                Picker("小时", selection: hourBinding) {
                    ForEach(0..<24) { hour in
                        Text(String(format: "%02d 点", hour)).tag(hour)
                    }
                }
                .labelsHidden()
                .pickerStyle(.menu)
                .tint(theme.primaryText)

                Text(SettingsStore.displayTime(minute))
                    .font(.title3.bold())
                    .monospacedDigit()
                    .foregroundStyle(theme.primaryText)
            }

            MinuteChipRow(selectedMinute: $minute, theme: theme)
        }
        .padding(16)
        .background(theme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct BreakQuickEditor: View {
    var title: String
    @Binding var isOn: Bool
    @Binding var start: Int
    @Binding var end: Int
    var theme: DashboardTheme

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Toggle(isOn: $isOn) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.headline)
                    Text("\(SettingsStore.displayTime(start))-\(SettingsStore.displayTime(end))")
                        .font(.caption)
                        .foregroundStyle(theme.secondaryText)
                }
            }

            if isOn {
                TimeQuickEditor(title: "开始", minute: $start, theme: theme)
                TimeQuickEditor(title: "结束", minute: $end, theme: theme)
            }
        }
        .padding(16)
        .background(theme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct MinuteChipRow: View {
    @Binding var selectedMinute: Int
    var theme: DashboardTheme

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 6)

    var body: some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: 8) {
            ForEach(SettingsStore.allowedMinuteComponents, id: \.self) { item in
                let isSelected = selectedMinute % 60 == item
                Button {
                    selectedMinute = SettingsStore.minuteOfDay(hour: selectedMinute / 60, minuteComponent: item)
                } label: {
                    Text(String(format: "%02d", item))
                        .font(.caption.bold())
                        .monospacedDigit()
                        .foregroundStyle(isSelected ? theme.primaryButtonText : theme.primaryText)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(isSelected ? theme.accent : theme.secondarySurface, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

private struct StatusPill: View {
    var title: String
    var theme: DashboardTheme
    var isOvertime: Bool

    var body: some View {
        Text(title)
            .font(.caption.bold())
            .foregroundStyle(isOvertime ? theme.overtime : theme.accent)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background((isOvertime ? theme.overtime : theme.accent).opacity(0.14), in: Capsule())
    }
}

private struct CountdownBlock: View {
    var title: String
    var value: String
    var theme: DashboardTheme

    var body: some View {
        VStack(alignment: .trailing, spacing: 6) {
            Text(title)
                .font(.caption.bold())
                .foregroundStyle(theme.secondaryText)
            Text(value)
                .font(.system(size: 21, weight: .bold, design: .rounded))
                .monospacedDigit()
                .lineLimit(1)
                .foregroundStyle(theme.primaryText)
        }
        .frame(minWidth: 124, alignment: .trailing)
        .padding(.horizontal, 12)
        .padding(.vertical, 14)
        .background(theme.secondarySurface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct MetricChip: View {
    var title: String
    var value: String
    var theme: DashboardTheme

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.caption2.bold())
                .foregroundStyle(theme.secondaryText)
            Text(value)
                .font(.caption.bold())
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .foregroundStyle(theme.primaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(theme.secondarySurface, in: Capsule())
    }
}

private struct SegmentedScheduleProgressView: View {
    var progress: Double
    var workStartMinute: Int
    var workEndMinute: Int
    var breaks: [WorkBreak]
    var theme: DashboardTheme

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            let start = Double(workStartMinute)
            let end = Double(max(workEndMinute, workStartMinute + 1))
            let duration = max(end - start, 1)

            ZStack(alignment: .leading) {
                Capsule()
                    .fill(theme.track)
                Capsule()
                    .fill(theme.accent)
                    .frame(width: width * min(max(progress, 0), 1))
                ForEach(breaks) { item in
                    let breakStart = min(max((Double(item.startMinute) - start) / duration, 0), 1)
                    let breakEnd = min(max((Double(item.endMinute) - start) / duration, 0), 1)
                    if breakEnd > breakStart {
                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                            .fill(theme.restSegment)
                            .overlay {
                                RoundedRectangle(cornerRadius: 3, style: .continuous)
                                    .stroke(theme.restBorder, lineWidth: 1)
                            }
                            .frame(width: max(width * (breakEnd - breakStart), 4))
                            .offset(x: width * breakStart)
                    }
                }
            }
        }
        .frame(height: 10)
    }
}

private struct MoneyField: View {
    var title: String
    @Binding var value: Double
    var theme: DashboardTheme

    var body: some View {
        NumberField(title: title, value: $value, theme: theme, prefix: "¥")
    }
}

private struct NumberField: View {
    var title: String
    @Binding var value: Double
    var theme: DashboardTheme
    var prefix = ""

    var body: some View {
        HStack {
            Text(title)
                .font(.subheadline)
                .foregroundStyle(theme.primaryText)
            Spacer()
            HStack(spacing: 4) {
                if !prefix.isEmpty {
                    Text(prefix)
                        .foregroundStyle(theme.secondaryText)
                }
                TextField("0", value: $value, format: .number)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 100)
            }
            .font(.headline)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(theme.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }
}

private struct DashboardTheme {
    var appearance: AppAppearance

    var background: Color {
        appearance == .night ? Color(red: 0.05, green: 0.06, blue: 0.08)
                             : Color(red: 0.96, green: 0.98, blue: 0.98)
    }

    var heroSurface: Color {
        appearance == .night ? Color(red: 0.10, green: 0.12, blue: 0.16)
                             : Color.white
    }

    var surface: Color {
        appearance == .night ? Color(red: 0.13, green: 0.15, blue: 0.19)
                             : Color.white
    }

    var secondarySurface: Color {
        appearance == .night ? Color.white.opacity(0.08)
                             : Color(red: 0.90, green: 0.95, blue: 0.96)
    }

    var primaryText: Color {
        appearance == .night ? Color.white.opacity(0.95)
                             : Color(red: 0.08, green: 0.10, blue: 0.12)
    }

    var secondaryText: Color {
        appearance == .night ? Color.white.opacity(0.58)
                             : Color(red: 0.36, green: 0.42, blue: 0.45)
    }

    var border: Color {
        appearance == .night ? Color.white.opacity(0.08)
                             : Color.black.opacity(0.05)
    }

    var track: Color {
        appearance == .night ? Color.white.opacity(0.12)
                             : Color.black.opacity(0.09)
    }

    var restSegment: Color {
        appearance == .night ? Color(red: 0.95, green: 0.64, blue: 0.26).opacity(0.46)
                             : Color(red: 1.00, green: 0.72, blue: 0.32).opacity(0.50)
    }

    var restBorder: Color {
        appearance == .night ? Color(red: 1.00, green: 0.82, blue: 0.45).opacity(0.86)
                             : Color(red: 0.80, green: 0.45, blue: 0.10).opacity(0.55)
    }

    var accent: Color { Color(red: 0.16, green: 0.86, blue: 0.43) }
    var blue: Color { Color(red: 0.20, green: 0.55, blue: 0.95) }
    var overtime: Color { Color(red: 1.0, green: 0.55, blue: 0.20) }
    var primaryButtonText: Color { appearance == .night ? Color.black : Color.white }

    static let lockPreview = DashboardTheme(appearance: .night)
}

private enum LockPreviewPalette {
    static let surface = Color(red: 0.07, green: 0.08, blue: 0.10)
    static let secondary = Color.white.opacity(0.62)
    static let accent = Color(red: 0.22, green: 0.95, blue: 0.55)
    static let overtime = Color(red: 1.0, green: 0.58, blue: 0.24)
}

private extension Double {
    var hoursAsHourMinuteText: String {
        let totalMinutes = max(Int((self * 60).rounded()), 0)
        let hours = totalMinutes / 60
        let minutes = totalMinutes % 60
        return "\(hours):" + String(format: "%02d", minutes)
    }
}

#if DEBUG
#Preview {
    ContentView()
        .environmentObject(SettingsStore())
        .environmentObject(EarningsService())
        .environmentObject(LiveActivityManager())
}
#endif
