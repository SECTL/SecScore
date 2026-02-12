import { Column, Entity, PrimaryGeneratedColumn, ManyToMany, JoinTable } from 'typeorm'
import { TagEntity } from './TagEntity'

@Entity({ name: 'students' })
export class StudentEntity {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'text' })
  name!: string

  @Column({ type: 'text', default: '[]' })
  tags!: string

  @Column({ type: 'integer', default: 0 })
  score!: number

  @Column({ type: 'text', nullable: true })
  extra_json!: string | null

  @Column({ type: 'text', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: string

  @Column({ type: 'text', default: () => 'CURRENT_TIMESTAMP' })
  updated_at!: string

  @ManyToMany(() => TagEntity, { cascade: true })
  @JoinTable({
    name: 'student_tags',
    joinColumn: { name: 'student_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' }
  })
  tagEntities!: TagEntity[]
}
