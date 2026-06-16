import XCTest
@testable import HappyWork

@MainActor
final class HappyWorkTests: XCTestCase {

    private func ephemeralStore() -> SettingsStore {
        let suite = "test.happywork." + UUID().uuidString
        return SettingsStore(defaults: UserDefaults(suiteName: suite)!)
    }

    private func day(_ hour: Int, _ minute: Int = 0) -> Date {
        var components = DateComponents()
        components.year = 2026
        components.month = 6
        components.day = 16
        components.hour = hour
        components.minute = minute
        components.second = 0
        return Calendar(identifier: .gregorian).date(from: components)!
    }

    func testEffectiveHourlyRate_usesMonthlySalaryAndPaidHours() {
        let store = ephemeralStore()
        store.monthlySalary = 16000
        store.annualBonus = 0
        store.monthlyPaidDays = 20
        store.workStartMinute = 9 * 60
        store.workEndMinute = 17 * 60
        store.lunchBreakEnabled = false
        store.dinnerBreakEnabled = false

        XCTAssertEqual(store.effectiveHourlyRate, 100, accuracy: 0.001)
    }

    func testEffectiveHourlyRate_amortizesAnnualBonusAcrossFullYear() {
        let store = ephemeralStore()
        store.monthlySalary = 16000
        store.annualBonus = 19200
        store.monthlyPaidDays = 20
        store.workStartMinute = 9 * 60
        store.workEndMinute = 17 * 60
        store.lunchBreakEnabled = false
        store.dinnerBreakEnabled = false

        XCTAssertEqual(store.effectiveHourlyRate, 110, accuracy: 0.001)
    }

    func testWorkSessionSnapshot_excludesLunchBreak() {
        let session = WorkSession(startDate: day(9),
                                  endDate: day(18),
                                  hourlyRate: 60,
                                  overtimeMultiplier: 1.5,
                                  breaks: [WorkBreak(name: "午休", startMinute: 12 * 60, endMinute: 13 * 60)],
                                  isOvertimeActive: false)

        let duringLunch = session.snapshot(at: day(12, 30))
        XCTAssertEqual(duringLunch.earned, 180, accuracy: 0.01)
        XCTAssertTrue(duringLunch.isOnBreak)

        let afterLunch = session.snapshot(at: day(14))
        XCTAssertEqual(afterLunch.normalElapsed, 4 * 3600, accuracy: 0.01)
        XCTAssertEqual(afterLunch.earned, 240, accuracy: 0.01)
        XCTAssertEqual(afterLunch.progress, 0.5, accuracy: 0.001)
    }

    func testWorkSessionSnapshot_addsAfterWorkOvertimeAndSkipsDinnerBreak() {
        let session = WorkSession(startDate: day(9),
                                  endDate: day(18),
                                  hourlyRate: 60,
                                  overtimeMultiplier: 1.5,
                                  breaks: [
                                      WorkBreak(name: "午休", startMinute: 12 * 60, endMinute: 13 * 60),
                                      WorkBreak(name: "晚休", startMinute: 18 * 60 + 30, endMinute: 19 * 60 + 30)
                                  ],
                                  isOvertimeActive: true)

        let snap = session.snapshot(at: day(20))
        XCTAssertEqual(snap.normalElapsed, 8 * 3600, accuracy: 0.01)
        XCTAssertEqual(snap.overtimeElapsed, 3600, accuracy: 0.01)
        XCTAssertEqual(snap.earned, 570, accuracy: 0.01)
        XCTAssertTrue(snap.isOvertime)
        XCTAssertFalse(session.isComplete(at: day(20)))
    }

    func testWorkSessionSnapshot_finishesWithoutOvertime() {
        let session = WorkSession(startDate: day(9),
                                  endDate: day(18),
                                  hourlyRate: 60,
                                  overtimeMultiplier: 1.5,
                                  breaks: [WorkBreak(name: "午休", startMinute: 12 * 60, endMinute: 13 * 60)],
                                  isOvertimeActive: false)

        let snap = session.snapshot(at: day(20))
        XCTAssertEqual(snap.earned, 480, accuracy: 0.01)
        XCTAssertEqual(snap.progress, 1.0, accuracy: 0.0001)
        XCTAssertEqual(snap.mood, .harvest)
        XCTAssertTrue(snap.isFinished)
        XCTAssertTrue(session.isComplete(at: day(20)))
    }

    func testMoodStageProgression() {
        XCTAssertEqual(MoodStage.forProgress(0.0), .calm)
        XCTAssertEqual(MoodStage.forProgress(0.5), .focus)
        XCTAssertEqual(MoodStage.forProgress(0.8), .flow)
        XCTAssertEqual(MoodStage.forProgress(1.0), .harvest)
    }
}
