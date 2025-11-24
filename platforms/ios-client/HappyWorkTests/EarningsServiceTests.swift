import XCTest
@testable import HappyWork

final class EarningsServiceTests: XCTestCase {
    func testRecalcUpdatesSnapshotWithElapsedTime() async {
        let service = EarningsService()
        let start = Date().addingTimeInterval(-1500) // 25 分钟前
        await service.startSession(start: start, hourlyRate: 120)

        service.recalc(at: Date())

        let snapshot = service.snapshot
        XCTAssertEqual(snapshot.hourlyRate, 120)
        XCTAssertGreaterThan(snapshot.elapsed, 1490)
        XCTAssertLessThan(snapshot.elapsed, 1510)
        XCTAssertEqual(String(format: "%.2f", snapshot.earned), "50.00")
        XCTAssertEqual(snapshot.moodStage, .focus)
    }

    func testUpdateAdjustsHourlyRate() {
        let service = EarningsService()
        service.update(rate: 200)

        XCTAssertEqual(service.snapshot.hourlyRate, 200)
    }
}
