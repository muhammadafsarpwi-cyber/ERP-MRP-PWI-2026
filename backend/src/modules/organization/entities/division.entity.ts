import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from './company.entity';
import { Section } from './section.entity';
import { Department } from './department.entity';

export enum DivisionStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('divisions')
export class Division extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company, (company) => company.divisions)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'division_code', type: 'varchar', length: 50 })
  divisionCode: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 20, default: DivisionStatus.ACTIVE })
  status: DivisionStatus;

  @OneToMany(() => Section, (section) => section.division)
  sections: Section[];

  @OneToMany(() => Department, (department) => department.division)
  departments: Department[];
}
