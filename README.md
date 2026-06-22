# 打工人加油站多端实现

本仓库基于原有的浏览器插件实现，重新按终端形态拆分为四套实现：
- 浏览器插件（Chrome 扩展，当前完整实现）
- 安卓客户端（待实现）
- 鸿蒙客户端（待实现）
- iOS 客户端（SwiftUI + ActivityKit 实时活动，已可在模拟器构建运行；上架待签名）

## 目录结构

```
platforms/
├── browser-extension/   # 现有 Chrome 插件代码与文档
├── android-client/      # 安卓客户端骨架与需求说明
├── harmony-client/      # 鸿蒙客户端骨架与需求说明
└── ios-client/          # iOS 客户端（SwiftUI + ActivityKit，XcodeGen 工程）
```

## 开发与构建

### 浏览器插件
1. 进入目录并安装依赖：
   ```bash
   cd platforms/browser-extension
   npm install
   ```
2. 开发模式：
   ```bash
   npm run dev
   ```
3. 生产构建：
   ```bash
   npm run build
   ```

### iOS 客户端
```bash
cd platforms/ios-client
open HappyWork.xcodeproj   # 选 iOS 16.2+ 模拟器直接 Run，无需 Apple 账号
```
真机调试与上架（签名步骤）见 [`platforms/ios-client/README.md`](platforms/ios-client/README.md)。

### 其他客户端
- 安卓 / 鸿蒙客户端目录下提供了初步的结构与说明文档，可按照文档补充对应平台的实现。

## 协作说明
- 代码、文档均使用中文。
- 针对浏览器插件的改动，请在 `platforms/browser-extension` 目录内进行，并使用对应的脚本进行开发与构建。
- 其他终端的开发可参考浏览器插件的业务逻辑与配置结构，保持体验一致性。
