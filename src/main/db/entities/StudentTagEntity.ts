import { Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Index } from 'typeorm'
import { StudentEntity } from './StudentEntity'
import { TagEntity } from './TagEntity'

@Entity({ name: 'student_tags' })
@Index(['student_id', 'tag_id'], { unique: true })
export class StudentTagEntity {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ name: 'student_id', type: 'integer' })
  student_id!: number

  @Column({ name: 'tag_id', type: 'integer' })
  tag_id!: number

  @ManyToOne(() => StudentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student!: StudentEntity

  @ManyToOne(() => TagEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tag_id' })
  tag!: TagEntity

  @Column({ type: 'text', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: string
}
