import { match, pinyin } from "pinyin-pro"

export const splitStudentAliases = (value: unknown) =>
  Array.from(
    new Set(
      String(value ?? "")
        .split(/[,，、;；\n\r]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )

export const normalizeStudentAliases = (value: unknown) => splitStudentAliases(value).join(", ")

export const matchStudentSearchValue = (value: unknown, keyword: string) => {
  const text = String(value ?? "").trim()
  const query = String(keyword ?? "")
    .trim()
    .toLowerCase()
  if (!query) return true
  if (!text) return false

  const compactQuery = query.replace(/\s+/g, "")
  const textLower = text.toLowerCase()
  if (textLower.includes(query) || textLower.replace(/\s+/g, "").includes(compactQuery)) {
    return true
  }

  const pinyinText = pinyin(text, { toneType: "none" }).toLowerCase()
  const pinyinInitials = pinyin(text, { pattern: "first", toneType: "none" })
    .toLowerCase()
    .replace(/\s+/g, "")
  if (
    pinyinText.replace(/\s+/g, "").includes(compactQuery) ||
    pinyinInitials.includes(compactQuery)
  ) {
    return true
  }

  try {
    return (
      Array.isArray(match(text, query)) ||
      (compactQuery !== query && Array.isArray(match(text, compactQuery)))
    )
  } catch {
    return false
  }
}

export const matchStudentSearch = (
  student: { name?: unknown; student_no?: unknown; alias?: unknown },
  keyword: string
) =>
  [student.name, student.student_no, ...splitStudentAliases(student.alias)].some((value) =>
    matchStudentSearchValue(value, keyword)
  )
