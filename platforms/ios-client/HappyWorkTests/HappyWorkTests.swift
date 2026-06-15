import XCTest
@testable import HappyWork

/// 纯逻辑单测（无需真机/模拟器界面）。重点回归守护：
/// 1) 年终奖按「全年」折算进时薪（历史上这里漏过 /12，导致时薪高估 12 倍）；
/// 2) 收入/进度在收工时间封顶。
@MainActor
final class HappyWorkTests: XCTestCase {

    private func ephemeralStore() -> SettingsStore {
        let suite = "test.happywork." + UUID().uuidString
        return SettingsStore(defaults: UserDefaults(suiteName: suite)!)
    }

    func testEffectiveHourlyRate_noBonus_equalsBase() {
        let store = ephemeralStore()
        store.hourlyRate = 50
        store.annualBonus = 0
        XCTAssertEqual(store.effectiveHourlyRate, 50, accuracy: 0.0001)
    }

    func testEffectiveHourlyRate_amortizesAnnualBonusAcrossFullYear() {
        let store = ephemeralStore()
        store.hourlyRate = 50
        // 全年奖金 20880 / (12 个月 × 174 小时/月) = 20880 / 2088 = 10 元/小时
        store.annualBonus = 20880
        XCTAssertEqual(store.effectiveHourlyRate, 60, accuracy: 0.01,
                       "年终奖必须按全年折算（/12/月工时），而不是按月")
    }

    func testEffectiveHourlyRate_neverNegative() {
        let store = ephemeralStore()
        store.hourlyRate = 0
        store.annualBonus = 0
        XCTAssertGreaterThanOrEqual(store.effectiveHourlyRate, 0)
    }

    func testWorkSessionSnapshot_oneHourIn() {
        let start = Date(timeIntervalSince1970: 0)
        let session = WorkSession(startDate: start,
                                  endDate: start.addingTimeInterval(8 * 3600),
                                  hourlyRate: 60)
        let s = session.snapshot(at: start.addingTimeInterval(3600))
        XCTAssertEqual(s.earned, 60, accuracy: 0.01)          // 1 小时 × 60
        XCTAssertEqual(s.progress, 1.0 / 8.0, accuracy: 0.001) // 8 小时工作日的 1/8
    }

    func testWorkSessionSnapshot_capsAtWorkdayEnd() {
        let start = Date(timeIntervalSince1970: 0)
        let session = WorkSession(startDate: start,
                                  endDate: start.addingTimeInterval(8 * 3600),
                                  hourlyRate: 60)
        let s = session.snapshot(at: start.addingTimeInterval(100 * 3600)) // 远超收工
        XCTAssertEqual(s.earned, 60 * 8, accuracy: 0.01)  // 封顶在整日工资
        XCTAssertEqual(s.progress, 1.0, accuracy: 0.0001) // 进度封顶 100%
        XCTAssertEqual(s.mood, .harvest)
        XCTAssertTrue(session.isComplete(at: start.addingTimeInterval(100 * 3600)))
    }

    func testMoodStageProgression() {
        XCTAssertEqual(MoodStage.forProgress(0.0), .calm)
        XCTAssertEqual(MoodStage.forProgress(0.5), .focus)
        XCTAssertEqual(MoodStage.forProgress(0.8), .flow)
        XCTAssertEqual(MoodStage.forProgress(1.0), .harvest)
    }
}
