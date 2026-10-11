import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { SoftDeletableEntity } from '../../../common/soft-deletable.entity';

/**
 * QC inspection plan (the tolerance template an inspection is measured against).
 *
 * Extends `SoftDeletableEntity` rather than `BaseEntity`: `qc_inspection_plans`
 * has the `is_active` column the base carries, so the standard Recycle Bin base
 * applies cleanly. A plan is a pure template with no stock or ledger impact, so
 * it can be trashed at any time; `qc.service.ts` refuses only when inspections
 * already reference it.
 */
@Entity('qc_inspection_plans')
export class QcInspectionPlan extends SoftDeletableEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'plan_code', type: 'varchar', length: 50 })
  planCode: string;

  @Column({ name: 'plan_name', type: 'varchar', length: 255 })
  planName: string;

  @Column({ name: 'inspection_type', type: 'varchar', length: 30, default: 'INCOMING' })
  inspectionType: string;

  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId: string | null;

  @Column({ name: 'sampling_plan', type: 'varchar', length: 50, nullable: true })
  samplingPlan: string | null;

  @Column({ name: 'acceptance_criteria', type: 'text', nullable: true })
  acceptanceCriteria: string | null;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;
}