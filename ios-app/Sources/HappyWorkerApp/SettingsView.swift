import SwiftUI

struct SettingsView: View {
    @Binding var dailyIncome: Double

    var body: some View {
        Form {
            Section("收入设置") {
                TextField("今日工资", value: $dailyIncome, format: .number)
                    .keyboardType(.decimalPad)
            }
        }
        .navigationTitle("设置")
    }
}
