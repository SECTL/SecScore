declare const __LITE__: boolean

/**
 * 构建期常量：lite 便携版为 true。
 * full 构建（默认）为 false；由 vite define 注入，dead branch 会被 rollup 剔除。
 */
export const LITE_BUILD: boolean = __LITE__
