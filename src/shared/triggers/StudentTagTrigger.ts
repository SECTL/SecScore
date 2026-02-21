import type { TriggerLogic } from './types'

export const studentTagTrigger: TriggerLogic = {
  eventName: 'student_tag_matched',
  label: '按照学生标签触发',
  description: '当学生标签匹配时触发自动化',

  validate: (value: string) => {
    if (!value || value.trim() === '') {
      return { valid: false, message: '请输入标签名称' }
    }
    return { valid: true }
  },

  check: (context, value) => {
    const tagName = value.trim().toLowerCase()
    const matchedStudents = context.students.filter((student: any) => {
      if (student.tags && Array.isArray(student.tags)) {
        return student.tags.some((tag: string) => tag.toLowerCase() === tagName)
      }
      return false
    })

    return {
      shouldExecute: matchedStudents.length > 0,
      matchedStudents,
      nextExecuteTime: context.now
    }
  }
}
