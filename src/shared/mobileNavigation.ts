import { LITE_BUILD } from "./buildFlags"

export const MOBILE_NAV_ALL_KEYS = [
  "home",
  "students",
  "score",
  "auto-score",
  "reward-settings",
  "boards",
  "leaderboard",
  "settlements",
  "reasons",
  "plugins",
  "settings",
] as const

export type MobileNavKey = (typeof MOBILE_NAV_ALL_KEYS)[number]

export interface MobileNavItemConfig {
  key: MobileNavKey
  path: string
  labelKey: string
  adminOnly?: boolean
}

const FULL_NAV_ITEMS: MobileNavItemConfig[] = [
  { key: "home", path: "/home", labelKey: "sidebar.home" },
  { key: "students", path: "/students", labelKey: "sidebar.students", adminOnly: true },
  { key: "score", path: "/score", labelKey: "sidebar.score" },
  { key: "auto-score", path: "/auto-score", labelKey: "sidebar.autoScore", adminOnly: true },
  {
    key: "reward-settings",
    path: "/reward-settings",
    labelKey: "sidebar.rewardSettings",
    adminOnly: true,
  },
  { key: "boards", path: "/boards", labelKey: "sidebar.boards" },
  { key: "leaderboard", path: "/leaderboard", labelKey: "sidebar.leaderboard" },
  { key: "settlements", path: "/settlements", labelKey: "sidebar.settlements" },
  { key: "reasons", path: "/reasons", labelKey: "sidebar.reasons", adminOnly: true },
  { key: "plugins", path: "/plugins", labelKey: "sidebar.plugins", adminOnly: true },
  { key: "settings", path: "/settings", labelKey: "sidebar.settings" },
]

// lite 便携版仅保留核心页面；full 保持原导航不变。
const LITE_NAV_KEYS: MobileNavKey[] = ["home", "students", "score", "leaderboard", "settings"]

export const MOBILE_NAV_ITEMS: MobileNavItemConfig[] = LITE_BUILD
  ? FULL_NAV_ITEMS.filter((item) => LITE_NAV_KEYS.includes(item.key))
  : FULL_NAV_ITEMS

const MOBILE_NAV_KEY_SET = new Set<string>(MOBILE_NAV_ITEMS.map((item) => item.key))

export const sanitizeMobileNavKeys = (
  input: unknown,
  fallback: MobileNavKey[] = MOBILE_NAV_ITEMS.map((item) => item.key)
): MobileNavKey[] => {
  if (!Array.isArray(input)) return fallback
  const deduped: MobileNavKey[] = []
  for (const rawKey of input) {
    if (typeof rawKey !== "string" || !MOBILE_NAV_KEY_SET.has(rawKey)) continue
    const key = rawKey as MobileNavKey
    if (!deduped.includes(key)) deduped.push(key)
  }
  return deduped.length > 0 ? deduped : fallback
}
