# 鸿蒙客户端（待实现）

本目录用于鸿蒙版客户端的实现规划，建议使用 ArkTS/Stage 模型，遵循鸿蒙系统设计规范。

## 建议结构
```
platforms/harmony-client/
├── entry/
│   ├── src/main/ets/       # ArkTS 业务代码
│   ├── src/main/resources/ # 静态资源
│   └── module.json5        # 模块配置
└── hvigorfile.ts           # 工程构建脚本
```

## 开发提示
- 结合浏览器插件的计薪算法与心情系统，迁移为 ArkTS 可复用模块。
- 使用鸿蒙的卡片/组件展示实时收入、进度条与价值换算信息。
- 配置数据可使用分布式数据服务或本地持久化，保持多设备同步体验。
