import SwiftUI
import Combine

struct ContentView: View {
    @EnvironmentObject private var earningsService: EarningsService
    @EnvironmentObject private var activityManager: LiveActivityManager
    @State private var hourlyRate: Double = 50
    @State private var startTime = Date()
    @State private var isWorking = false

    var body: some View {
        NavigationView {
            VStack(spacing: 24) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("当前时薪")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    HStack(alignment: .firstTextBaseline) {
                        Text(String(format: "¥%.0f", hourlyRate))
                            .font(.system(size: 32, weight: .bold))
                        Spacer()
                        Button(action: {
                            withAnimation {
                                hourlyRate = max(10, hourlyRate + 10)
                                earningsService.update(rate: hourlyRate)
                            }
                        }) {
                            Image(systemName: "plus.circle.fill")
                        }
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
                    await earningsService.startSession(start: startTime, hourlyRate: hourlyRate)
                } else {
                    earningsService.stopSession()
                }
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
}

#Preview {
    ContentView()
        .environmentObject(EarningsService())
        .environmentObject(LiveActivityManager())
}
