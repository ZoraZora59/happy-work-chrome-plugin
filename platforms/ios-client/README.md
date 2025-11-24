# iOS 客户端

基于 SwiftUI + ActivityKit 的原生实现，支持在锁屏与动态岛实时查看收入与进展。目录已包含 App 与 Widget Extension 的基础代码，可直接导入 Xcode 15+ 运行，并提供 XcodeGen 配置与 CI 工作流。

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
├── HappyWorkTests/            # 单元测试
├── project.yml                # XcodeGen 项目配置（自动生成 Xcode 工程）
└── README.md
```

## 开发环境
- Xcode 15+，iOS 17+（ActivityKit 需要 16.2+，建议 17 以获得最新 API）
- 安装 [XcodeGen](https://github.com/yonaskolb/XcodeGen) 生成工程：`brew install xcodegen`
- Apple Silicon 模拟器推荐 iOS 17.5 以上，真实设备需开启锁屏小组件支持。

## 主要功能
- **计薪与心情阶段**：`EarningsService` 每秒刷新 elapsed/earned，并根据时间段映射为不同心情阶段与表情。
- **锁屏实时进度**：`LiveActivityManager` 与 Widget `HappyWorkLiveActivity` 协作，展示当前收入、已用时长与心情状态。
- **动态岛体验**：紧凑/扩展区域分别展示表情、收入与进度条，随状态刷新。

## 运行步骤
1. 在仓库根目录执行 `cd platforms/ios-client && xcodegen generate` 自动生成 `HappyWork.xcodeproj` 与 scheme。
2. 打开生成的项目，选择 `HappyWork` scheme，目标设备设为 `iPhone 15 (iOS 17.5)` 或真机。
3. 运行前在 *Signing & Capabilities* 中配置团队签名、启用 *Background Modes*（至少 `Background fetch`）、`Live Activities` 与通知权限。
4. Command+U 运行测试（`HappyWorkTests`），Command+R 运行 App，点击「开始打工」再点击「启动」以创建锁屏进度。

## 重点实现说明
- `EarningsService` 使用 `Timer` 每秒计算收入并推导心情阶段（冷静搬砖→专注冲刺→灵感爆棚→需要休息），提供 `recalc` 便于单元测试和手动重算。
- `LiveActivityManager` 依赖 `ActivityKit` 创建/更新/结束 `WorkAttributes` 活动，确保锁屏与动态岛同步刷新。
- `HappyWorkLiveActivity` 提供锁屏视图与动态岛布局，包含进度条、已赚金额与心情文案。

## CI / 测试
- `.github/workflows/ios-ci.yml` 提供 macOS Runner 的构建与测试流程：安装 XcodeGen、生成工程、在 iOS 17.5 模拟器上运行 `xcodebuild test`。
- 本地可运行 `xcodebuild test -scheme HappyWork -destination 'platform=iOS Simulator,name=iPhone 15,OS=17.5' CODE_SIGNING_ALLOWED=NO` 验证。

## 后续可拓展
- 增加本地持久化或 iCloud 同步，让计薪配置在多设备一致。
- 支持推送驱动的 Live Activity（`pushType`），便于跨设备更新。
- 引入 HealthKit 或 Screen Time 数据，为心情阶段提供更智能的算法。
