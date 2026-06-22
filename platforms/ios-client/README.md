# iOS 客户端（打工人加油站）

基于 **SwiftUI + ActivityKit** 的原生实现：App 内每秒展示实时收入与进度，并通过
**Live Activity** 在锁屏 / 灵动岛展示进度。工程用 **XcodeGen** 从 `project.yml` 生成，
仓库已附带生成好的 `HappyWork.xcodeproj`，可直接打开。

> 当前状态：**代码已通过编译校验**——App 与 Widget 两个 target 均用 iOS 16.2 SDK
> typecheck 通过，核心计薪逻辑单测通过（详见「测试」）。在 Xcode 选 iOS 16.2+ 模拟器
> 即可直接 Run。真机调试与上架需要你自己的 Apple 账号/签名，详见文末「📋 距离上架还差什么」。
>
> 若 Xcode 报 `No available simulator runtimes`，到 **Xcode › Settings › Components**
> 下载一个 iOS 模拟器运行时即可（编译 App 图标资源也需要它）。

---

## 🚀 现在就能跑（模拟器，无需任何 Apple 账号）

```bash
cd platforms/ios-client
open HappyWork.xcodeproj
```

在 Xcode 里：
1. 顶部选一个 **iOS 16.2+ 的模拟器**（动态岛需要 iPhone 14 Pro / 15 Pro 及以上型号的模拟器）。
2. 直接 **Run（⌘R）**。模拟器构建**不需要签名、不需要登录 Apple ID**。
3. 点「开始打工」→ 点「启动」创建锁屏实时活动。锁屏可在模拟器里用 **Device › Lock**（⌘L）查看。

需要 Xcode 15+（建议 16）。若你修改了 `project.yml`，用下面命令重建工程：

```bash
brew install xcodegen   # 仅首次
xcodegen generate
```

---

## 目录结构

```
platforms/ios-client/
├── project.yml                     # XcodeGen 工程定义（真实来源）
├── HappyWork.xcodeproj/            # 生成的 Xcode 工程（已入库，可直接打开）
├── Shared/
│   └── WorkAttributes.swift        # Live Activity 属性，App 与 Widget 共用
├── HappyWork/                      # App 主工程
│   ├── HappyWorkApp.swift          # 入口，注入服务、重启后恢复会话/活动
│   ├── ContentView.swift           # 首页：配置时薪、实时收入、锁屏控制
│   ├── Info.plist                  # 含 NSSupportsLiveActivities
│   ├── PrivacyInfo.xcprivacy       # 隐私清单（声明 UserDefaults 使用原因）
│   ├── Models/                     # MoodStage / EarningsSnapshot / WorkSession
│   ├── Services/                   # 计薪、持久化、Live Activity 管理
│   └── Assets.xcassets/            # App 图标（单尺寸 1024，Xcode 自动缩放）
├── HappyWorkWidget/                # Widget Extension（承载 Live Activity）
│   ├── HappyWorkWidgetBundle.swift
│   ├── HappyWorkLiveActivity.swift # 锁屏 + 灵动岛布局
│   ├── Info.plist                  # NSExtensionPointIdentifier = widgetkit-extension
│   └── PrivacyInfo.xcprivacy
└── HappyWorkTests/                 # 纯逻辑单测（计薪/折算/封顶）
```

## 功能

- **月薪优先**：用户填月薪、年终奖和每月计薪天数，App 自动折算有效时薪；旧版时薪配置会
  自动迁移成月薪估算值（年终奖按全年 /12 摊到每月）。
- **作息可配置**：默认 965（午休 12:00-13:30、晚休 18:30-19:30），一键切 996 或自定义上下班时间；
  切换预设会同步调整每月计薪天数（965 → 21.75，996 → 26）。分钟会规整到偷懒友好的刻度。
- **午休 / 晚休自动扣除**：休息段从计薪时长中扣除，休息时间不计薪，并在锁屏进度条上标记断点。
- **下班后加班费**：下班后点「开启加班费」即可按加班倍数累加收入；倍数可在设置里调，默认 1.5 倍。
- **手动停止计薪**：点「结束打工」即停表并定格当天最终收入；当天重开 App 会恢复这笔收入，
  跨天后自动清零（不会把昨天的收入带到今天）。
- **计薪与心情**：按有效计薪时长实时计算收入；进度（0~100%，按正常工时）映射心情阶段：
  冷静搬砖 🙂 → 专注冲刺 🚀 → 灵感爆棚 🔥 → 收获满满 🤩。状态细分为
  还没上班 / 计薪中 / 休息中 / 加班中 / 今日已收工。
- **日间 / 夜间主题**：首页一键切换浅色 / 深色界面，选择本地持久化。
- **锁屏 / 灵动岛**：下班倒计时和日程进度条会**自动走动**；收入明确标记为快照，打开 App 后自动刷新（见下）。
- **重启恢复**：会话与配置存在本地，App 重启后自动恢复，并重新接管仍存活的 Live Activity。

---

## ⚠️ 锁屏实时性的边界（重要，已和苹果文档核对）

这是本类 App 最容易踩的坑，先讲清楚：

- ✅ **日程时间 / 进度条**：用系统的 `Text(timerInterval:)` 和 `ProgressView(timerInterval:)`
  渲染。系统会自行按时间插值，**即使 App 没有运行，锁屏上也会自动走动**。
- ⚠️ **有效计薪时长**：午休、晚休、加班费都在 App 内准确计算；锁屏系统计时视图只能展示
  日程时间，无法在后台自动扣除休息段。
- ❌ **收入金额（¥）无法在后台逐秒跳动**。Live Activity 运行在一个**无网络、不执行代码**的
  沙盒里，系统只能自动推进「时间类」视图，**无法对任意数字（如逐秒增长的金额）做插值**。
  因此金额是一个**快照**：只在你**打开 App** 时（或切到后台前）刷新，锁屏上会标注「收入快照」「截至 HH:mm」，超过 1 分钟未更新会提示「金额待刷新」。动态岛紧凑态只展示可由系统持续更新的计薪状态和下班倒计时，避免把静止金额误认为实时值。

  > 苹果原文："Each Live Activity runs in its own sandbox, and — unlike a widget — it can't
  > access the network… To update the dynamic data of an active Live Activity, use ActivityKit
  > in your app or allow your Live Activities to receive ActivityKit push notifications."
  > （[文档](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities)）

**要让锁屏金额也逐秒跳动，只有一条路：推送驱动（APNs push + 服务端）。** 那需要付费开发者账号
配置 Push 能力与一个定时推送的后端，属于本期范围之外的增强项（见「后续可拓展」）。

---

## 数据与持久化

- 配置（月薪、年终奖、每月计薪天数、作息、午休/晚休、加班倍数）与进行中的会话用
  **UserDefaults** 持久化。
- **未使用 App Group**：Widget 的数据全部通过 Live Activity 的 `ContentState` 传递，
  Widget 不直接读 UserDefaults。App Group 需要付费账号配置 entitlement，留到将来做
  「主屏小组件读取配置」时再加。

## 测试

`HappyWorkTests` 是纯逻辑单测（无需界面），共 13 个用例，覆盖：月薪折算、年终奖按全年折算、
作息分钟规整、作息摘要、日夜主题持久化、中文倒计时格式化、午休扣除、晚休扣除、下班后加班费、
收入/进度在收工时封顶、手动停止保留最终快照、停止记录当天恢复与跨天过期、心情映射。

```bash
# 需要完整 Xcode（命令行工具不含模拟器/XCTest）
xcodebuild test -scheme HappyWork -destination 'platform=iOS Simulator,name=iPhone 15 Pro'
```

---

## 📋 距离上架还差什么：签名与部署交接清单

按「能做什么」分成三档。**第 1 档现在就成立；第 2、3 档需要你的 Apple 账号，是交接给你的部分。**

### 第 1 档 · 模拟器运行 — ✅ 已就绪，无需账号
直接 `open HappyWork.xcodeproj` 选模拟器 Run。本地 Live Activity 仅需 Info.plist 的
`NSSupportsLiveActivities`（已配置），**不需要任何付费能力**。

### 第 2 档 · 真机调试 — 免费 Apple ID 即可
1. Xcode › Settings › Accounts 登录你的 Apple ID（免费的「Personal Team」）。
2. 把占位 bundle id 改成你自己的（见下方「必改项」）。
3. 选中真机 Run。
4. 限制（苹果对免费账号的硬限制）：描述文件 **7 天过期**需重装；最多 3 台测试设备、10 个 App ID。
5. 灵动岛需要 iPhone 14 Pro / 15 Pro 及以上真机；其余机型只有锁屏样式。

### 第 3 档 · 上架 App Store — 需要付费开发者账号（$99/年）

**必改项（工程当前写的是打包时所用个人账号的值，上架/真机前请换成你自己的）：**
- `project.yml` 里 `options.bundleIdPrefix` 当前为 `com.happywork.an97555w6c`，换成你拥有的反向域名
  （如 `com.yourname`），改完 `xcodegen generate` 重建；或直接在 Xcode 改两个 target 的 Bundle Identifier。
  ⚠️ **Widget 的 id 必须是 App id 的子级**（`xxx.app` / `xxx.app.widget`），否则上传校验失败。
- `project.yml` 里 `DEVELOPMENT_TEAM` 当前为 `AN97555W6C`（个人 Team），填你自己的 10 位 Team ID
  （或在 Xcode Signing & Capabilities 选 Team）。

**上架流程（你来做）：**
1. [Apple Developer](https://developer.apple.com) 注册付费会员（$99/年）。
2. App Store Connect 注册 **App ID**（含 Widget 的 App ID）。
3. 证书 + 描述文件：建议用 Xcode **Automatic signing** 自动生成。
4. App Store Connect 新建 App 记录（名称、分类、语言）。
5. 准备素材：各尺寸**截图**、**App 隐私填报**（本仓库已附 `PrivacyInfo.xcprivacy`，声明了
   UserDefaults 的使用原因 CA92.1，是上传校验的硬性要求）、**年龄分级**、**出口合规**声明。
6. Xcode：选「Any iOS Device」→ Product › **Archive** → 上传到 App Store Connect。
7. 走 **TestFlight** 内测，确认锁屏/灵动岛在真机正常。
8. 提交审核（Submit for Review）。

**哪些能力需要付费账号**（本期都没用到，所以现在不挡你）：
- 推送驱动的 Live Activity（锁屏金额逐秒跳）→ 需要 Push Notifications / APNs。
- App Group（App 与小组件共享数据）→ 需要付费账号配置 entitlement。

---

## 已知限制 / 后续可拓展

- 锁屏金额为快照（见上）。增强：接 **APNs push** 驱动逐秒刷新。
- 锁屏日程进度不会自动扣午休/晚休；App 内计薪会扣除。增强：推送或更细粒度 Live Activity 状态。
- 可加：主屏小组件（需 App Group）、iCloud 同步配置、节假日/大小周排班日历、HealthKit 心情算法。
