# iOS 客户端

基于 SwiftUI + ActivityKit 的原生实现，支持在锁屏与动态岛实时查看收入与进展。目录已包含 App 与 Widget Extension 的基础代码，可直接导入 Xcode 15+ 运行。

## 目录结构
```
platforms/ios-client/
├── HappyWork/                 # App 主工程（SwiftUI）
│   ├── HappyWorkApp.swift     # App 入口，注入计薪与活动管理服务
│   ├── ContentView.swift      # 首页，展示时薪调节、实时收入与进度条、启动/结束锁屏进度
│   ├── Models/                # 数据模型（心情阶段等）
│   └── Services/              # 计薪计算、Live Activity 管理
├── HappyWorkWidget/           # Widget Extension，提供锁屏/动态岛实时进度
│   ├── HappyWorkLiveActivity.swift
│   ├── HappyWorkWidgetBundle.swift
│   └── WorkAttributes.swift
└── README.md
```

## 开发环境
- Xcode 15+，iOS 17+（ActivityKit 需要 16.2+，建议 17 以获得最新 API）
- 打开 `platforms/ios-client` 目录后，使用 **File > Open** 选择此文件夹或创建 `HappyWork.xcodeproj` 将现有源码添加为 target 与 extension。

## 主要功能
- **计薪与心情阶段**：`EarningsService` 每秒刷新 elapsed/earned，并根据时间段映射为不同心情阶段与表情。
- **锁屏实时进度**：`LiveActivityManager` 与 Widget `HappyWorkLiveActivity` 协作，展示当前收入、已用时长与心情状态。
- **动态岛体验**：紧凑/扩展区域分别展示表情、收入与进度条，随状态刷新。

## 运行步骤
1. 在 Xcode 中创建一个新的 iOS App target（Bundle ID 建议 `com.example.HappyWork`），将 `HappyWork` 目录的 Swift 文件加入 target。
2. 创建一个 Widget Extension target，将 `HappyWorkWidget` 目录下的文件加入，并在 *Deployment Info* 中勾选 **Live Activities**。
3. 在 App 的 `Signing & Capabilities` 中开启 *Background Modes*（至少 `Background fetch`）、`Live Activities` 与通知权限。
4. 连接真机（必须支持动态岛或 iOS 16.2+ 锁屏）运行，点击「开始打工」再点击「启动」以创建锁屏进度。

## 重点实现说明
- `EarningsService` 使用 `Timer` 每秒计算收入并推导心情阶段（冷静搬砖→专注冲刺→灵感爆棚→需要休息）。
- `LiveActivityManager` 依赖 `ActivityKit` 创建/更新/结束 `WorkAttributes` 活动，确保锁屏与动态岛同步刷新。
- `HappyWorkLiveActivity` 提供锁屏视图与动态岛布局，包含进度条、已赚金额与心情文案。

## 后续可拓展
- 增加本地持久化或 iCloud 同步，让计薪配置在多设备一致。
- 支持推送驱动的 Live Activity（`pushType`），便于跨设备更新。
- 引入 HealthKit 或 Screen Time 数据，为心情阶段提供更智能的算法。
