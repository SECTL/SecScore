import { describe, expect, it } from "vitest"
import { matchStudentSearch, normalizeStudentAliases, splitStudentAliases } from "./studentSearch"

describe("student search", () => {
  it("splits and normalizes multiple aliases", () => {
    expect(splitStudentAliases("大张， 小张\n大张;小王")).toEqual(["大张", "小张", "小王"])
    expect(normalizeStudentAliases("大张， 小张\n大张")).toBe("大张, 小张")
  })

  it("matches alias pinyin initials without spaces", () => {
    const student = { name: "张三", student_no: "1001", alias: "大张, 小张" }
    expect(matchStudentSearch(student, "dz")).toBe(true)
    expect(matchStudentSearch(student, "xz")).toBe(true)
    expect(matchStudentSearch(student, "1001")).toBe(true)
  })
})
