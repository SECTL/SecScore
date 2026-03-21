export const getAvatarFromExtraJson = (extraJson?: string | null): string | null => {
  if (!extraJson) return null

  try {
    const parsed = JSON.parse(extraJson)
    if (!parsed || typeof parsed !== "object") return null

    const avatar = (parsed as Record<string, unknown>).avatar
    if (typeof avatar !== "string") return null

    const trimmed = avatar.trim()
    if (!trimmed) return null

    if (trimmed.startsWith("data:image/")) return trimmed
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed

    return null
  } catch {
    return null
  }
}

export const setAvatarInExtraJson = (
  extraJson: string | null | undefined,
  avatar: string | null
): string => {
  let base: Record<string, unknown> = {}

  if (extraJson) {
    try {
      const parsed = JSON.parse(extraJson)
      if (parsed && typeof parsed === "object") {
        base = parsed as Record<string, unknown>
      }
    } catch {
      base = {}
    }
  }

  if (avatar && avatar.trim()) {
    base.avatar = avatar.trim()
  } else {
    delete base.avatar
  }

  return JSON.stringify(base)
}
