export const SYSTEM_FONT_STACK =
  '"PingFang SC", "PingFangTC-Regular", "Hiragino Sans GB", "Hiragino Sans", "STHeiti", "Heiti SC", "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", "微软雅黑", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'

export const normalizeSystemFontName = (name: string): string =>
  String(name || "")
    .trim()
    .replace(/^["']+|["']+$/g, "")

export const quoteFontFamilyName = (name: string): string =>
  `"${normalizeSystemFontName(name).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`

export const buildSystemFontFamily = (name: string): string => {
  const normalized = normalizeSystemFontName(name)
  if (!normalized) return SYSTEM_FONT_STACK
  return `${quoteFontFamilyName(normalized)}, ${SYSTEM_FONT_STACK}`
}

export const buildSystemFontValue = (name: string): string => {
  const normalized = normalizeSystemFontName(name)
  if (!normalized) return "system"
  return `system-${normalized}`
}

export const resolveStoredFontFamily = (fontValue?: string): string => {
  if (!fontValue || fontValue === "system") return SYSTEM_FONT_STACK
  if (fontValue.startsWith("system-")) {
    return buildSystemFontFamily(fontValue.slice("system-".length))
  }
  return SYSTEM_FONT_STACK
}
