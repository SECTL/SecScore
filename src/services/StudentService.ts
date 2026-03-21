import { Service } from "../shared/kernel"
import { ClientContext } from "../ClientContext"

declare module "../shared/kernel" {
  interface Context {
    students: StudentService
  }
}

export class StudentService extends Service {
  constructor(ctx: ClientContext) {
    super(ctx, "students")
  }

  async findAll() {
    return await (window as any).api.queryStudents({})
  }

  async create(data: any) {
    return await (window as any).api.createStudent(data)
  }

  async update(id: number, data: any) {
    return await (window as any).api.updateStudent(id, data)
  }

  async delete(id: number) {
    return await (window as any).api.deleteStudent(id)
  }
}
