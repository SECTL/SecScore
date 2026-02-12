import { DataSource, Repository } from 'typeorm'
import { TagEntity } from '../db/entities/TagEntity'
import { StudentTagEntity } from '../db/entities/StudentTagEntity'

export class TagRepository {
  private tagRepo: Repository<TagEntity>
  private studentTagRepo: Repository<StudentTagEntity>

  constructor(dataSource: DataSource) {
    this.tagRepo = dataSource.getRepository(TagEntity)
    this.studentTagRepo = dataSource.getRepository(StudentTagEntity)
  }

  async findAll(): Promise<TagEntity[]> {
    return this.tagRepo.find({ order: { created_at: 'ASC' } })
  }

  async findByName(name: string): Promise<TagEntity | null> {
    return this.tagRepo.findOne({ where: { name } })
  }

  async create(name: string): Promise<TagEntity> {
    const tag = this.tagRepo.create({ name })
    return this.tagRepo.save(tag)
  }

  async findOrCreate(name: string): Promise<TagEntity> {
    const existing = await this.findByName(name)
    if (existing) return existing
    return this.create(name)
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.tagRepo.delete(id)
    return result.affected === 1
  }

  async findByStudent(studentId: number): Promise<TagEntity[]> {
    const relations = await this.studentTagRepo
      .createQueryBuilder('st')
      .leftJoinAndSelect('st.tag', 'tag')
      .where('st.student_id = :studentId', { studentId })
      .orderBy('st.created_at', 'ASC')
      .getMany()

    return relations.map((r) => r.tag).filter(Boolean)
  }

  async addTagToStudent(studentId: number, tagId: number): Promise<void> {
    const exists = await this.studentTagRepo.findOne({
      where: { student_id: studentId, tag_id: tagId }
    })
    if (!exists) {
      const relation = this.studentTagRepo.create({
        student_id: studentId,
        tag_id: tagId
      })
      await this.studentTagRepo.save(relation)
    }
  }

  async removeTagFromStudent(studentId: number, tagId: number): Promise<void> {
    await this.studentTagRepo.delete({
      student_id: studentId,
      tag_id: tagId
    })
  }

  async updateStudentTags(studentId: number, tagIds: number[]): Promise<void> {
    await this.studentTagRepo.delete({ student_id: studentId })
    for (const tagId of tagIds) {
      const relation = this.studentTagRepo.create({
        student_id: studentId,
        tag_id: tagId
      })
      await this.studentTagRepo.save(relation)
    }
  }
}
