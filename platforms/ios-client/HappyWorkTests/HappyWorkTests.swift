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

    func testScheduleMinutes_normalizesToLazyAllowedChoices() {
        let store = ephemeralStore()

        XCTAssertEqual(SettingsStore.allowedMinuteComponents, [0, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55])

        store.workStartMinute = 9 * 60 + 7
        store.workEndMinute = 18 * 60 + 58
        store.lunchStartMinute = 12 * 60 + 4

        XCTAssertEqual(store.workStartMinute, 9 * 60 + 10)
        XCTAssertEqual(store.workEndMinute, 18 * 60 + 55)
        XCTAssertEqual(store.lunchStartMinute, 12 * 60)
    }

    func testScheduleSummary_keepsHomeScreenConcise() {
        let store = ephemeralStore()
        store.workStartMinute = 9 * 60 + 30
        store.workEndMinute = 18 * 60 + 30
        store.lunchBreakEnabled = true
        store.lunchStartMinute = 12 * 60
        store.lunchEndMinute = 13 * 60 + 30
        store.dinnerBreakEnabled = false

        XCTAssertEqual(store.scheduleSummary, "09:30-18:30 · 午休 12:00-13:30")
    }

    func testAppAppearance_persistsDayNightMode() {
        let suite = "test.happywork.appearance." + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        let store = SettingsStore(defaults: defaults)

        store.appAppearance = .night

        let restored = SettingsStore(defaults: defaults)
        XCTAssertEqual(restored.appAppearance, .night)
    }

    func testReadableCountdown_usesExplicitChineseUnits() {
        XCTAssertEqual(WorkDurationFormatter.readableCountdown(10 * 3600 + 19 * 60), "10小时19分")
        XCTAssertEqual(WorkDurationFormatter.readableCountdown(19 * 60), "19分钟")
        XCTAssertEqual(WorkDurationFormatter.readableCountdown(2 * 3600), "2小时")
        XCTAssertEqual(WorkDurationFormatter.readableCountdown(59), "不足1分钟")
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

    func testEarningsServiceStop_preservesFinalSnapshot() {
        let session = WorkSession(startDate: day(9),
                                  endDate: day(18),
                                  hourlyRate: 60,
                                  overtimeMultiplier: 1.5,
                                  breaks: [WorkBreak(name: "午休", startMinute: 12 * 60, endMinute: 13 * 60)],
                                  isOvertimeActive: false)
        let service = EarningsService()

        service.start(session)
        service.stop(at: day(11))

        XCTAssertNil(service.session)
        XCTAssertTrue(service.hasStoppedSession)
        XCTAssertEqual(service.snapshot.elapsed, 2 * 3600, accuracy: 0.01)
        XCTAssertEqual(service.snapshot.earned, 120, accuracy: 0.01)
        XCTAssertEqual(service.snapshot.progress, 0.25, accuracy: 0.001)
    }

    func testStoppedWorkRecord_restoresFinalSnapshot() {
        let session = WorkSession(startDate: day(9),
                                  endDate: day(18),
                                  hourlyRate: 60,
                                  overtimeMultiplier: 1.5,
                                  breaks: [WorkBreak(name: "午休", startMinute: 12 * 60, endMinute: 13 * 60)],
                                  isOvertimeActive: false)
        let record = StoppedWorkRecord(session: session, stoppedAt: day(14))
        let service = EarningsService()

        service.restoreStopped(record)

        XCTAssertNil(service.session)
        XCTAssertTrue(service.hasStoppedSession)
        XCTAssertEqual(service.snapshot.elapsed, 4 * 3600, accuracy: 0.01)
        XCTAssertEqual(service.snapshot.earned, 240, accuracy: 0.01)
        XCTAssertEqual(service.snapshot.progress, 0.5, accuracy: 0.001)
    }

    func testStoppedWorkRecord_persistsForSameDayAndExpiresNextDay() {
        let suite = "test.happywork.stopped." + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        let store = SettingsStore(defaults: defaults)
        let session = WorkSession(startDate: day(9),
                                  endDate: day(18),
                                  hourlyRate: 60,
                                  overtimeMultiplier: 1.5,
                                  breaks: [],
                                  isOvertimeActive: false)
        let record = StoppedWorkRecord(session: session, stoppedAt: day(11))
        store.lastStoppedWork = record

        let restored = SettingsStore(defaults: defaults)
        XCTAssertEqual(restored.stoppedWorkRecord(for: day(20)), record)

        let nextDay = Calendar(identifier: .gregorian).date(byAdding: .day, value: 1, to: day(11))!
        XCTAssertNil(restored.stoppedWorkRecord(for: nextDay, calendar: Calendar(identifier: .gregorian)))
        XCTAssertNil(restored.lastStoppedWork)
    }

    func testMoodStageProgression() {
        XCTAssertEqual(MoodStage.forProgress(0.0), .calm)
        XCTAssertEqual(MoodStage.forProgress(0.5), .focus)
        XCTAssertEqual(MoodStage.forProgress(0.8), .flow)
        XCTAssertEqual(MoodStage.forProgress(1.0), .harvest)
    }

    // MARK: - 每周工作制

    /// 固定到具体日期（中午）：2026-06-15 周一 … 2026-06-28 周日。
    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        components.hour = 12
        return Calendar(identifier: .gregorian).date(from: components)!
    }

    /// 周一为一周之始，保证大小周的「本周」边界稳定。
    private var mondayCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.firstWeekday = 2
        return calendar
    }

    func testWorkWeekPattern_doubleRestMarksWeekend() {
        let store = ephemeralStore()
        store.workWeekPattern = .doubleRest
        let cal = mondayCalendar
        XCTAssertTrue(store.isRestDay(date(2026, 6, 20), calendar: cal))   // 周六
        XCTAssertTrue(store.isRestDay(date(2026, 6, 21), calendar: cal))   // 周日
        XCTAssertFalse(store.isRestDay(date(2026, 6, 22), calendar: cal))  // 周一
    }

    func testWorkWeekPattern_singleRestMarksOnlySunday() {
        let store = ephemeralStore()
        store.workWeekPattern = .singleRest
        let cal = mondayCalendar
        XCTAssertFalse(store.isRestDay(date(2026, 6, 20), calendar: cal))  // 周六照常上班
        XCTAssertTrue(store.isRestDay(date(2026, 6, 21), calendar: cal))   // 周日休息
    }

    func testWorkWeekPattern_customRestDays() {
        let store = ephemeralStore()
        store.workWeekPattern = .custom
        store.customRestWeekdays = [4]  // 仅周三休息
        let cal = mondayCalendar
        XCTAssertTrue(store.isRestDay(date(2026, 6, 17), calendar: cal))   // 周三
        XCTAssertFalse(store.isRestDay(date(2026, 6, 21), calendar: cal))  // 周日照常上班
    }

    func testWorkWeekPattern_bigSmallWeekAlternates() {
        let store = ephemeralStore()
        store.workWeekPattern = .bigSmallWeek
        let cal = mondayCalendar
        store.setBigSmallThisWeek(true, reference: date(2026, 6, 15), calendar: cal)  // 本周(15–21)为大周

        // 大周：只休周日
        XCTAssertFalse(store.isRestDay(date(2026, 6, 20), calendar: cal))  // 周六上班
        XCTAssertTrue(store.isRestDay(date(2026, 6, 21), calendar: cal))   // 周日休息
        // 下一周(22–28)为小周：双休
        XCTAssertTrue(store.isRestDay(date(2026, 6, 27), calendar: cal))   // 周六休息
        XCTAssertTrue(store.isRestDay(date(2026, 6, 28), calendar: cal))   // 周日休息
    }

    func testWorkWeekPattern_autoSyncsMonthlyPaidDays() {
        let store = ephemeralStore()
        store.workWeekPattern = .singleRest
        XCTAssertEqual(store.monthlyPaidDays, 26, accuracy: 0.001)
        store.workWeekPattern = .doubleRest
        XCTAssertEqual(store.monthlyPaidDays, 21.75, accuracy: 0.001)
        store.workWeekPattern = .custom
        store.customRestWeekdays = [1]  // 仅周日休 → 6 个工作日
        XCTAssertEqual(store.monthlyPaidDays, 26.1, accuracy: 0.01)
    }

    func testApplyPreset_setsWorkWeekPatternAndPaidDays() {
        let store = ephemeralStore()
        store.applyPreset(.long996)
        XCTAssertEqual(store.workWeekPattern, .singleRest)
        XCTAssertEqual(store.monthlyPaidDays, 26, accuracy: 0.001)

        store.applyPreset(.standard965)
        XCTAssertEqual(store.workWeekPattern, .doubleRest)
        XCTAssertEqual(store.monthlyPaidDays, 21.75, accuracy: 0.001)
    }

    func testWorkWeekPattern_persistsAcrossLaunch() {
        let suite = "test.happywork.workweek." + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        let store = SettingsStore(defaults: defaults)
        store.workWeekPattern = .custom
        store.customRestWeekdays = [1, 4, 7]

        let restored = SettingsStore(defaults: defaults)
        XCTAssertEqual(restored.workWeekPattern, .custom)
        XCTAssertEqual(restored.customRestWeekdays, [1, 4, 7])
    }
}
