# SecScore 主题系统

本目录包含 SecScore 应用的主题文件。主题采用 JSON 格式，支持热加载。

## 主题文件结构

```json
{
    "name": "主题名称",
    "description": "主题描述",
    "colors": {
        "primary": "主要颜色",
        "secondary": "次要颜色",
        "background": "背景色",
        "surface": "表面色",
        "text": "文本颜色",
        "textSecondary": "次要文本颜色",
        "success": "成功颜色",
        "warning": "警告颜色",
        "error": "错误颜色",
        "border": "边框颜色",
        "divider": "分隔线颜色"
    },
    "radius": {
        "small": 4,
        "medium": 8,
        "large": 12,
        "extraLarge": 16
    },
    "spacing": {
        "extraSmall": 4,
        "small": 8,
        "medium": 16,
        "large": 24,
        "extraLarge": 32
    },
    "fonts": {
        "caption": 12,
        "body": 14,
        "subtitle": 16,
        "title": 20,
        "headline": 24,
        "display": 32
    }
}
```

## 可用主题

- **default.json** - 默认明亮主题
- **dark.json** - 深色护眼主题

## 自定义主题

1. 创建新的 JSON 文件（例如 `custom.json`）
2. 按照上述结构定义主题属性
3. 保存到本目录
4. 在应用设置中选择新主题

## 热加载

主题文件修改后会自动重新加载，无需重启应用。文件监听器会自动检测变化并应用新主题。