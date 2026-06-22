# App 图标设计源

打工人加油站 iOS 图标的可编辑源文件与导出说明。

## 设计

- **方案**：搞钱绿。加粗 `¥` + 右下三根上升柱 = 工资实时上涨。
- **配色**：主色取自 App 内部「今天已赚」的搞钱绿（`accent` ≈ `#29DB6E`）。
  渐变 `#57E98A → #0FAE54`，去掉旧版橙色与细圆环（旧版的「土」主要来自橙色像银行 App、细圆环在小尺寸消失、细 `¥`）。
- **规范**：1024×1024、纯方形、不透明、**不带圆角**（iOS 会自动切圆角，自带圆角反而会被二次裁切）。

源文件：[`AppIcon.svg`](AppIcon.svg)

## 从 SVG 重新导出 PNG

本机没有 `rsvg-convert` / `inkscape`，用 Chrome 无头模式渲染（结果与正式版一致）：

```bash
cd platforms/ios-client/design

# 1. 包一层 HTML（去边距、铺满），把 AppIcon.svg 内容内联进去
cat > /tmp/icon.html <<'HTML'
<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;overflow:hidden;background:#0FAE54}svg{display:block}</style>
HTML
cat AppIcon.svg >> /tmp/icon.html

# 2. 无头 Chrome 截图，1:1 像素
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1024,1024 \
  --default-background-color=00000000 \
  --screenshot=AppIcon-1024.png "file:///tmp/icon.html"

# 3. 覆盖工程内图标
cp AppIcon-1024.png ../HappyWork/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png
```

导出后用 `sips -g pixelWidth -g hasAlpha AppIcon-1024.png` 确认是 1024×1024、`hasAlpha: no`。
