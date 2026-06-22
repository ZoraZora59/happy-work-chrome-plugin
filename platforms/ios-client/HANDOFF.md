# iOS 客户端交接文档（HANDOFF）

> 一句话：`platforms/ios-client/` 已从「散装 Swift 文件」补齐为**可在 Xcode 直接打开、
> 全量构建通过、单测全绿、模拟器实跑**的完整工程。**除「Apple 开发者账号 / 签名 / 上架」外，
> 其余全部就绪。**

- 分支：`feat/ios-client-buildable`（已 push 到 origin）— **现已合并入 `master`**
- 工程位置：`platforms/ios-client/`
- 技术栈：SwiftUI + ActivityKit（Live Activity）+ WidgetKit，XcodeGen 管理工程，部署目标 iOS 16.2

---

## 1. 背景与目标

- 起点：仓库里有一个 PR（#4）想加 iOS 骨架，但放在错误目录、功能更弱、且无法构建。
- 决策：**关闭 PR #4**（已被 master 上的 `platforms/ios-client/` 取代），在正确位置把 iOS 客户端
  做到「可打包部署前的最后一步」。
- 目标边界：一直做到**需要开发者账号签名/上架**为止，再交回。

## 2. 做了什么

### 工程化（从不可构建 → 可构建）
- 新增 **XcodeGen `project.yml`**：App target（`HappyWork`）+ Widget Extension target
  （`HappyWorkWidget`，承载 Live Activity）+ 单测 target（`HappyWorkTests`）。
- 正确处理了最容易踩坑的几点：扩展嵌入 App、**bundle id 嵌套**（`app` / `app.widget`）、
  `NSSupportsLiveActivities`（仅放 App）、widget 的 `NSExtensionPointIdentifier`、共享 scheme、中文开发区域。
- 生成并入库 `HappyWork.xcodeproj`，可直接 `open` 运行（也可 `xcodegen generate` 重建）。
- App 图标（1024 单尺寸、无 alpha）、无 storyboard 启动屏、两个 `Info.plist`。
- **`PrivacyInfo.xcprivacy`**：声明 UserDefaults（Required Reason API，原因码 `CA92.1`），
  否则上架会被拒（ITMS-91053）。

### 功能与修正
- **锁屏实时性修正（核心）**：已工作时长 / 进度条用系统计时视图（`Text(timerInterval:)` /
  `ProgressView(timerInterval:)`）在锁屏**自动走动**；收入金额为**快照**，标注「截至 HH:mm」。
  原因：Live Activity 运行在无网络、不执行代码的沙盒，系统只能插值时间类视图，**无法让任意数字
  （如逐秒增长的金额）自动跳动**。要逐秒跳只能上推送（见 §6）。
- ActivityKit 升级到 iOS 16.2 正式 API（`request(content:)` / `ActivityContent` / `update` / `end`），
  App 重启后通过 `Activity.activities` **重连**仍存活的活动。
- 配置（月薪、年终奖、每月计薪天数、作息、午休/晚休、加班倍数、日夜主题）与进行中会话、
  当天停止记录用 **UserDefaults 持久化**，重启自动恢复。
- **手动停止计薪 + 当天恢复**：点「结束打工」即停表并定格当天最终收入；当天重开 App 恢复这笔收入，
  跨天自动清零（修复「停止计薪后当日收入清零」）。
- **日间 / 夜间主题**：首页一键切换浅色 / 深色，选择本地持久化。
- **修复年终奖折算 bug**：按全年 `/12/月工时` 折算（旧实现漏 `/12`，时薪高估约 12 倍）。

### 文档
- 重写 `platforms/ios-client/README.md`：模拟器运行、锁屏实时性边界、完整签名/上架清单。
- 更新根 `README.md` 的 iOS 客户端状态。

## 3. 验证结果（强证据）

| 验证项 | 方式 | 结果 |
|---|---|---|
| 两个 target 编译 | iOS 16.2 SDK `swiftc -typecheck` | ✅ 均 exit 0 |
| 全量构建 | `xcodebuild build`（iPhone 17 Pro 模拟器） | ✅ `** BUILD SUCCEEDED **`（含资源/图标编译、链接 App 与 .appex） |
| 单元测试 | `xcodebuild test`（模拟器实跑 13 个用例） | ✅ `** TEST SUCCEEDED **`（折算/封顶/停止恢复/心情映射全过） |
| 实际运行 | 模拟器安装 + 启动 + 截图 | ✅ 首页 UI 正常渲染 |
| 代码评审 | 多视角对抗式 review + 复核 | ✅ 无真实 bug；评审建议已落地（隐私清单、scheme、测试等） |

> 说明：构建/测试/运行均在装好 iOS 26.5 模拟器运行时后完成。

## 4. 关键设计决策

- **锁屏金额是快照，不是逐秒跳动**——这是 ActivityKit 的硬约束，已和 Apple 文档核对。
  时间/进度免费自走，金额需 App 运行或推送才刷新。UI 已如实标注，避免误解为「坏了」。
- **不引入 App Group**：Live Activity 数据全部通过 `ContentState` 传递，Widget 不直接读 UserDefaults。
  App Group 需付费账号配 entitlement，故留到将来做「主屏小组件读配置」时再加。
- **本地更新（不走推送）**：因此**不需要 APNs / 付费能力**即可运行——签名边界更干净。

## 5. 交付物 / 目录

```
platforms/ios-client/
├── project.yml                 # XcodeGen 工程定义（真实来源）
├── HappyWork.xcodeproj/        # 生成的工程（可直接打开）
├── Shared/WorkAttributes.swift # App 与 Widget 共用的 Live Activity 属性
├── HappyWork/                  # App：入口/首页/模型/服务/资源/隐私清单
├── HappyWorkWidget/            # Widget Extension：锁屏 + 灵动岛
├── HappyWorkTests/             # 纯逻辑单测
├── README.md                   # 运行说明 + 上架清单
└── HANDOFF.md                  # 本文件
```

## 6. 交给你的部分：签名与上架

**现在就能跑（无需账号）：**
```bash
cd platforms/ios-client && open HappyWork.xcodeproj   # 选 iOS 16.2+ 模拟器 Run
```

**必改两处（上架/真机前；工程当前是打包所用个人账号的值）：**
1. `project.yml` 里 `options.bundleIdPrefix`：当前 `com.happywork.an97555w6c` → 你拥有的反向域名
   （如 `com.yourname`），改后 `xcodegen generate` 重建。⚠️ Widget id 必须是 App id 的子级。
2. `DEVELOPMENT_TEAM`：当前 `AN97555W6C` → 你自己的 10 位 Team ID（或在 Xcode Signing & Capabilities 选 Team）。

**三档能力边界：**
- **模拟器**：无需账号 ✅（已验证）。
- **真机调试**：免费 Apple ID 即可（描述文件 7 天过期；灵动岛需 iPhone 14 Pro 及以上真机）。
- **上架 App Store**：付费开发者账号（$99/年）→ 注册 App ID → 证书/描述文件（建议 Xcode 自动签名）
  → App Store Connect 建记录 → 截图 / 隐私填报 / 年龄分级 / 出口合规 → Archive → 上传 → TestFlight → 提审。

完整步骤见 [`README.md`](README.md) 的「📋 距离上架还差什么」。

## 7. 后续可拓展（非本期）

- **锁屏金额逐秒跳**：APNs push 驱动 Live Activity + 一个定时推送的后端（需付费账号的 Push 能力）。
- 主屏小组件（需 App Group）、iCloud 同步配置、加班/多段工时、更智能的心情算法。

## 8. 备注

- 若 Xcode 报 `No available simulator runtimes`：到 **Xcode › Settings › Components** 下载一个
  iOS 模拟器运行时（编译 App 图标资源也需要它）。
- 构建期间用过 `brew install xcodegen`（仅在重新生成工程时需要；可 `brew uninstall xcodegen` 还原）。
- 分支 `feat/ios-client-buildable` 已 push 到 origin 并合并入 `master`。
