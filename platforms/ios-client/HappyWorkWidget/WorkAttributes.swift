import ActivityKit
import Foundation

struct WorkAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var earned: Double
        var elapsed: TimeInterval
        var mood: String
        var emoji: String
    }

    var hourlyRate: Double
}
