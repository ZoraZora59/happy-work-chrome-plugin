import SwiftUI
import ActivityKit

struct ContentView: View {
    @State private var income: Double = 0
    @State private var dailyIncome: Double = 300
    @State private var progress: Double = 0
    @State private var activity: Activity<IncomeActivityAttributes>?

    var body: some View {
        NavigationView {
            VStack(spacing: 24) {
                Text("实时收入")
                    .font(.title2)
                Text("¥\(income, specifier: "%.2f")")
                    .font(.system(size: 48, weight: .bold))
                ProgressView(value: progress)
                    .progressViewStyle(.linear)
                worker
                Spacer()
                Button("开始实时收入", action: startActivity)
            }
            .padding()
            .navigationTitle("打工人加油站")
            .toolbar {
                NavigationLink(destination: SettingsView(dailyIncome: $dailyIncome)) {
                    Image(systemName: "gearshape")
                }
            }
            .onReceive(timer) { _ in updateIncome() }
        }
    }

    private var timer: Timer.TimerPublisher {
        Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    }

    private var worker: some View {
        let emoji: String
        switch progress {
        case 0..<0.5: emoji = "🚶‍♂️"
        case 0.5..<0.95: emoji = "🏃‍♂️💨"
        default: emoji = "🤩🎉"
        }
        return Text(emoji).font(.system(size: 72))
    }

    private func updateIncome() {
        let hourly = dailyIncome / (8 * 60 * 60)
        income += hourly
        progress = min(income / dailyIncome, 1)
        updateActivity()
    }

    private func startActivity() {
        let attributes = IncomeActivityAttributes(dailyIncome: dailyIncome)
        let state = IncomeActivityAttributes.ContentState(income: income, progress: progress)
        do {
            activity = try Activity.request(attributes: attributes, content: .init(state: state, staleDate: nil))
        } catch {
            print("Failed to start activity: \(error)")
        }
    }

    private func updateActivity() {
        Task {
            let state = IncomeActivityAttributes.ContentState(income: income, progress: progress)
            await activity?.update(.init(state: state, staleDate: nil))
        }
    }
}
