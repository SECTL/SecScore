import type { AutoScoreContext } from "../AutoScoreRuleEngine"

export interface StudentTagTriggerConfig {
  requiredTags: string[]
  matchMode: "any" | "all"
}

export function createStudentTagTrigger() {
  return {
    id: "student_has_tag",
    label: "学生标签",
    description: "当学生拥有指定标签时触发（需要以间隔时间加分为前提）",

    validate: (value: string): { valid: boolean; message?: string } => {
      if (!value || value.trim() === "") {
        return { valid: false, message: "请输入标签名称" }
      }
      return { valid: true }
    },

    check: (
      context: AutoScoreContext,
      value: string
    ): {
      shouldExecute: boolean
      matchedStudents?: Array<{ id: number; name: string; tags: string[] }>
    } => {
      const requiredTags = value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
      if (requiredTags.length === 0) {
        return { shouldExecute: false }
      }

      const matchedStudents = context.students.filter((student) => {
        const studentTags = student.tags || []
        return requiredTags.some((tag) => studentTags.includes(tag))
      })

      return {
        shouldExecute: matchedStudents.length > 0,
        matchedStudents,
      }
    },

    toRuleCondition: (value: string): any => {
      const requiredTags = value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)

      return {
        all: [
          {
            fact: "student",
            path: ".tags",
            operator: "containsAny",
            value: requiredTags,
          },
        ],
      }
    },

    requiresDependency: () => {
      return "interval_time_passed"
    },
  }
}
