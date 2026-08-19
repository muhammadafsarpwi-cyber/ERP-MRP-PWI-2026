import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from './company.entity';
import { Division } from './division.entity';
import { Department } from './department.entity';

export enum SectionStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('sections')
export class Section extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company, (company) => company.sections)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'division_id', type: 'uuid' })
  divisionId: string;

  @ManyToOne(() => Division, (division) => division.sections)
  @JoinColumn({ name: 'division_id' })
  division: Division;

  @Column({ name: 'section_code', type: 'varchar', length: 50 })
  sectionCode: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 20, default: SectionStatus.ACTIVE })
  status: SectionStatus;

  @OneToMany(() => Department, (department) => department.section)
  departments: Department[];
}
