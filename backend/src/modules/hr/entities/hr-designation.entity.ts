import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';

@Entity('hr_designations')
export class HrDesignation extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'designation_code', type: 'varchar', length: 50 })
  designationCode: string;

  @Column({ name: 'designation_name', type: 'varchar', length: 255 })
  designationName: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;
}