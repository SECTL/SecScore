# SecScore 主题系统

主题文件存储在 `themes/` 目录下，使用 JSON 格式。

## 主题结构

每个主题文件包含以下四个主要部分：

### 1. colors (颜色)
定义应用中使用的各种颜色。

- `background`: 主背景色
- `surface`: 表面/控件背景色
- `primary`: 主色调
- `primaryDark`: 主色调的深色版本
- `text`: 主要文本颜色
- `textSecondary`: 次要文本颜色
- `textDisabled`: 禁用状态文本颜色
- `border`: 边框颜色
- `divider`: 分隔线颜色
- `success`: 成功状态颜色
- `warning`: 警告状态颜色
- `danger`: 危险状态颜色
- `info`: 信息状态颜色
- `card`: 卡片背景色

### 2. radius (圆角)
定义控件的圆角半径。

- `small`: 小圆角（如按钮、输入框）
- `medium`: 中等圆角（如卡片）
- `large`: 大圆角（如对话框）
- `round`: 圆型（如头像、标签）

### 3. spacing (间距)
定义元素之间的间距。

- `xxs`: 超小间距（4px）
- `xs`: 小间距（8px）
- `sm`: 小等间距（12px）
- `md`: 中等间距（16px）
- `lg`: 大等间距（24px）
- `xl`: 大间距（32px）
- `xxl`: 超大间距（48px）

### 4. fonts (字体)
定义字体大小。

- `tiny`: 极小字体（10px）
- `small`: 小字体（12px）
- `medium`: 中等字体（14px）
- `large`: 大字体（16px）
- `xlarge`: 超大字体（18px）
- `xxlarge`: 极大字体（20px）
- `title`: 标题字体（24px）

## 使用方法

1. 将主题文件放到 `themes/` 目录下
2. 应用会自动检测并加载主题
3. 主题文件修改后会自动重新加载（热加载）

## 创建自定义主题

1. 复制 `default.json` 或 `dark.json`
2. 重命名（如 `mytheme.json`）
3. 修改颜色、圆角、间距、字体等值
4. 保存文件，主题会自动加载

## 注意事项

- 使用十六进制颜色值（如 "#4A90E2"）
- 间距和圆角使用数值（像素）
- 主题系统支持热加载，修改后无需重启应用

## 默认主题

- `default.json`: 浅色主题（默认）
- `dark.json`: 深色主题
