// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "HappyWorkerApp",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(
            name: "HappyWorkerApp",
            targets: ["HappyWorkerApp"])
    ],
    targets: [
        .target(
            name: "HappyWorkerApp",
            path: "Sources")
    ]
)
