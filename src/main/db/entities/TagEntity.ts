import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity({ name: 'tags' })
export class TagEntity {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'text', unique: true })
  name!: string

  @Column({ type: 'text', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: string

  @Column({ type: 'text', default: () => 'CURRENT_TIMESTAMP' })
  updated_at!: string
}
