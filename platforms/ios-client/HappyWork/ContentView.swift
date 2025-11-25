import SwiftUI
import Combine

struct ContentView: View {
    @EnvironmentObject private var earningsService: EarningsService
    @EnvironmentObject private var activityManager: LiveActivityManager
    @State private var hourlyRate: Double = 50
    @State private var annualBonus: Double = 0
    @State private var startTime = Date()
    @State private var isWorking = false

    private let standardMonthlyWorkHours: Double = 21.75 * 8

    private var effectiveHourlyRate: Double {
        let bonusHourly = annualBonus / standardMonthlyWorkHours
        return max(0, hourlyRate + bonusHourly)
    }

    var body: some View {
        NavigationView {
            VStack(spacing: 24) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("当前时薪（含年终奖）")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    HStack(alignment: .firstTextBaseline) {
                        Text(String(format: "¥%.0f", effectiveHourlyRate))
                            .font(.system(size: 32, weight: .bold))
                        Spacer()
                        Button(action: {
                            withAnimation {
                                hourlyRate = max(10, hourlyRate + 10)
                                syncWorkingRate()
                            }
                        }) {
                            Image(systemName: "plus.circle.fill")
                        }
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        Text("年终奖（税前，元）")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        TextField("0", value: $annualBonus, format: .number)
                            .keyboardType(.decimalPad)
                            .textFieldStyle(.roundedBorder)
                        Text("年终奖会按月折算进时薪，默认以每月 21.75 天、每天 8 小时计算。")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding()
                .background(.ultraThickMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                VStack(alignment: .leading, spacing: 12) {
                    Text(isWorking ? "计薪中" : "准备开始")
                        .font(.title2.bold())
                    Text(earningsService.progressDescription)
                        .font(.body)
                        .foregroundStyle(.secondary)

                    ProgressView(value: earningsService.progress)
                        .tint(.green)
                        .animation(.easeInOut, value: earningsService.progress)

                    HStack {
                        Text("已赚取 ¥" + earningsService.earningsString)
                        Spacer()
                        Text(earningsService.elapsedString)
                    }
                    .font(.callout)
                    .foregroundStyle(.secondary)

                    Button(action: toggleWork) {
                        Label(isWorking ? "结束打工" : "开始打工", systemImage: isWorking ? "stop.fill" : "play.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                }
                .padding()
                .background(.background, in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                VStack(alignment: .leading, spacing: 8) {
                    Text("锁屏实时进度")
                        .font(.headline)
                    Text("开启后可在锁屏和动态岛实时查看收入与心情进度。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    HStack {
                        Button(action: startLiveActivity) {
                            Label("启动", systemImage: "bolt.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.large)

                        Button(action: activityManager.endLiveActivity) {
                            Label("结束", systemImage: "xmark.circle.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                    }
                }
                .padding()
                .background(.ultraThickMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                Spacer()
            }
            .padding()
            .navigationTitle("打工人加油站")
            .task(id: isWorking) {
                if isWorking {
                    startTime = Date()
                    await earningsService.startSession(start: startTime, hourlyRate: effectiveHourlyRate)
                } else {
                    earningsService.stopSession()
                }
            }
            .onChange(of: annualBonus) { _ in
                syncWorkingRate()
            }
            .onReceive(earningsService.$snapshot) { _ in
                activityManager.updateLiveActivity()
            }
        }
    }

    private func toggleWork() {
        isWorking.toggle()
    }

    private func startLiveActivity() {
        activityManager.startLiveActivity()
    }

    private func syncWorkingRate() {
        guard isWorking else { return }
        earningsService.update(rate: effectiveHourlyRate)
    }
}

#Preview {
    ContentView()
        .environmentObject(EarningsService())
        .environmentObject(LiveActivityManager())
}
