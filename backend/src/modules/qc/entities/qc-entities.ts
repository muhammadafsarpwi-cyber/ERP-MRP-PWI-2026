import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { QcInspectionPlan } from './qc-inspection-plan.entity';

@Entity('qc_quality_characteristics')
export class QcQualityCharacteristic extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'plan_id', type: 'uuid' })
  planId: string;

  @ManyToOne(() => QcInspectionPlan, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_id' })
  plan: QcInspectionPlan;

  @Column({ name: 'characteristic_name', type: 'varchar', length: 255 })
  characteristicName: string;

  @Column({ name: 'characteristic_type', type: 'varchar', length: 30, default: 'DIMENSIONAL' })
  characteristicType: string;

  @Column({ name: 'uom_id', type: 'uuid', nullable: true })
  uomId: string | null;

  @Column({ name: 'target_value', type: 'numeric', precision: 19, scale: 6, nullable: true })
  targetValue: number | null;

  @Column({ name: 'tolerance_min', type: 'numeric', precision: 19, scale: 6, nullable: true })
  toleranceMin: number | null;

  @Column({ name: 'tolerance_max', type: 'numeric', precision: 19, scale: 6, nullable: true })
  toleranceMax: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  method: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  instrument: string | null;

  @Column({ name: 'is_critical', type: 'boolean', default: false })
  isCritical: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;
}

@Entity('qc_inspections')
export class QcInspection extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'inspection_no', type: 'varchar', length: 50 })
  inspectionNo: string;

  @Column({ name: 'inspection_type', type: 'varchar', length: 30, default: 'INCOMING' })
  inspectionType: string;

  @Column({ name: 'plan_id', type: 'uuid', nullable: true })
  planId: string | null;

  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId: string | null;

  @Column({ type: 'numeric', precision: 15, scale: 4, nullable: true })
  quantity: number | null;

  @Column({ name: 'uom_id', type: 'uuid', nullable: true })
  uomId: string | null;

  @Column({ name: 'reference_type', type: 'varchar', length: 50, nullable: true })
  referenceType: string | null;

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId: string | null;

  @Column({ name: 'inspection_date', type: 'date', nullable: true })
  inspectionDate: Date | null;

  @Column({ name: 'inspector_id', type: 'uuid', nullable: true })
  inspectorId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  result: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: string;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @OneToMany(() => QcInspectionResult, (r) => r.inspection)
  results: QcInspectionResult[];
}

@Entity('qc_inspection_results')
export class QcInspectionResult extends BaseEntity {
  @Column({ name: 'inspection_id', type: 'uuid' })
  inspectionId: string;

  @ManyToOne(() => QcInspection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inspection_id' })
  inspection: QcInspection;

  @Column({ name: 'characteristic_id', type: 'uuid' })
  characteristicId: string;

  @ManyToOne(() => QcQualityCharacteristic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'characteristic_id' })
  characteristic: QcQualityCharacteristic;

  @Column({ name: 'measured_value', type: 'numeric', precision: 19, scale: 6, nullable: true })
  measuredValue: number | null;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  result: string;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;
}

@Entity('qc_defect_classifications')
export class QcDefectClassification extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'defect_code', type: 'varchar', length: 50 })
  defectCode: string;

  @Column({ name: 'defect_name', type: 'varchar', length: 255 })
  defectName: string;

  @Column({ type: 'varchar', length: 20, default: 'MINOR' })
  severity: string;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;
}

@Entity('qc_ncr')
export class QcNcr extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'ncr_no', type: 'varchar', length: 50 })
  ncrNo: string;

  @Column({ name: 'inspection_id', type: 'uuid', nullable: true })
  inspectionId: string | null;

  @Column({ name: 'reference_type', type: 'varchar', length: 50, nullable: true })
  referenceType: string | null;

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId: string | null;

  @Column({ name: 'defect_classification_id', type: 'uuid', nullable: true })
  defectClassificationId: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 30, default: 'PENDING' })
  disposition: string;

  @Column({ name: 'supplier_id', type: 'uuid', nullable: true })
  supplierId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'OPEN' })
  status: string;

  @Column({ name: 'opened_date', type: 'date', nullable: true })
  openedDate: Date | null;

  @Column({ name: 'closed_date', type: 'date', nullable: true })
  closedDate: Date | null;

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo: string | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;
}

@Entity('qc_capa')
export class QcCapa extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'capa_no', type: 'varchar', length: 50 })
  capaNo: string;

  @Column({ name: 'ncr_id', type: 'uuid', nullable: true })
  ncrId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ name: 'root_cause', type: 'text', nullable: true })
  rootCause: string | null;

  @Column({ name: 'corrective_action', type: 'text', nullable: true })
  correctiveAction: string | null;

  @Column({ name: 'preventive_action', type: 'text', nullable: true })
  preventiveAction: string | null;

  @Column({ name: 'responsible_person', type: 'uuid', nullable: true })
  responsiblePerson: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'OPEN' })
  status: string;

  @Column({ name: 'effective_check_date', type: 'date', nullable: true })
  effectiveCheckDate: Date | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;
}