import ActivityKit
import WidgetKit
import SwiftUI

struct IncomeActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var income: Double
        var progress: Double
    }
    var dailyIncome: Double
}

struct IncomeActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: IncomeActivityAttributes.self) { context in
            VStack {
                Text("¥\(context.state.income, specifier: "%.2f")")
                ProgressView(value: context.state.progress)
            }
            .padding()
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.center) {
                    Text("¥\(context.state.income, specifier: "%.2f")")
                }
            } compactLeading: {
                Text("¥")
            } compactTrailing: {
                Text("\(Int(context.state.progress * 100))%")
            } minimal: {
                Text("\(Int(context.state.progress * 100))%")
            }
        }
    }
}

@main
struct IncomeActivityBundle: WidgetBundle {
    var body: some Widget {
        IncomeActivityWidget()
    }
}
