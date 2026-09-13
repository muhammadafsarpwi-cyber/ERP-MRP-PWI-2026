import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Machine } from '../../production/entities/machine.entity';
import { MachineComponent } from './machine-component.entity';
import { MaintenanceJobCard } from '../../maintenance/entities/maintenance-job-card.entity';
import { MaterialIssue } from '../../store/entities/material-issue.entity';
import { ErpUser } from '../../user/entities/erp-user.entity';

/** Physical condition of the removed tool at the time of a change. */
export enum ComponentConditionStatus {
  NEW = 'NEW',
  USED = 'USED',
  DAMAGED = 'DAMAGED',
  REWORKED = 'REWORKED',
  OTHER = 'OTHER',
}

/**
 * TASK26 — disposition of a removed tool (where it goes after removal).
 * Stored on the change that removed it. Reuses the condition_status for the
 * physical state; disposition describes the destination.
 */
export enum ToolDispositionType {
  RETURN_TO_STORE = 'RETURN_TO_STORE',
  SENT_FOR_REWORK = 'SENT_FOR_REWORK',
  SCRAPPED = 'SCRAPPED',
  LOST = 'LOST',
  RETAINED = 'RETAINED',
  OTHER = 'OTHER',
}

export const TOOL_DISPOSITION_TYPES: ReadonlyArray<ToolDispositionType> = [
  ToolDispositionType.RETURN_TO_STORE,
  ToolDispositionType.SENT_FOR_REWORK,
  ToolDispositionType.SCRAPPED,
  ToolDispositionType.LOST,
  ToolDispositionType.RETAINED,
  ToolDispositionType.OTHER,
];

/**
 * A single tool / component change (installation or removal) recorded against
 * a machine + component. Production counter snapshots (before / after) are the
 * manual counters recorded by the operator at the moment of the change; the ERP
 * computes production_since_previous from the previous change on the same line.
 */
@Entity('component_changes')
@Index(['companyId'])
@Index(['machineId'])
@Index(['componentId'])
@Index(['changeDate'])
@Index(['jobCardId'])
export class ComponentChange extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'machine_id', type: 'uuid' })
  machineId: string;

  @ManyToOne(() => Machine)
  @JoinColumn({ name: 'machine_id' })
  machine: Machine;

  @Column({ name: 'component_id', type: 'uuid' })
  componentId: string;

  @ManyToOne(() => MachineComponent)
  @JoinColumn({ name: 'component_id' })
  component: MachineComponent;

  /** Optional relationship to a maintenance Job Card. Routine tool changes never auto-create job cards. */
  @Column({ name: 'job_card_id', type: 'uuid', nullable: true })
  jobCardId: string | null;

  @ManyToOne(() => MaintenanceJobCard, { nullable: true })
  @JoinColumn({ name: 'job_card_id' })
  jobCard: MaintenanceJobCard | null;

  /** Snapshot of the removed tool's code (e.g. TD-011) — kept even if the master is later edited. */
  @Column({ name: 'old_tool_code', type: 'varchar', length: 120, nullable: true })
  oldToolCode: string | null;

  /** Installed tool's code (e.g. TD-012). */
  @Column({ name: 'new_tool_code', type: 'varchar', length: 120 })
  newToolCode: string;

  @Column({ name: 'new_tool_description', type: 'varchar', length: 255, nullable: true })
  newToolDescription: string | null;

  @Column({ name: 'change_date', type: 'date' })
  changeDate: string;

  @Column({ name: 'change_time', type: 'time', nullable: true })
  changeTime: string | null;

  /** Machine production counter read at removal. */
  @Column({ name: 'production_counter_before', type: 'numeric', precision: 19, scale: 4, nullable: true })
  productionCounterBefore: string | null;

  /** Machine production counter read after installing the new tool. */
  @Column({ name: 'production_counter_after', type: 'numeric', precision: 19, scale: 4, nullable: true })
  productionCounterAfter: string | null;

  /**
   * Life covered by the previous tool between the two most recent changes.
   * Computed by the service as counterBefore − previousChange.counterAfter.
   */
  @Column({ name: 'production_since_previous', type: 'numeric', precision: 19, scale: 4, nullable: true })
  productionSincePrevious: string | null;

  @Column({ name: 'reason', type: 'varchar', length: 255, nullable: true })
  reason: string | null;

  /** Condition of the removed tool. */
  @Column({ name: 'condition_status', type: 'varchar', length: 40, nullable: true })
  conditionStatus: string | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  /** Recording instant. */
  @Column({ name: 'changed_at', type: 'timestamp with time zone' })
  changedAt: Date;

  @Column({ name: 'changed_by', type: 'uuid', nullable: true })
  changedBy: string | null;

  @ManyToOne(() => ErpUser, { nullable: true })
  @JoinColumn({ name: 'changed_by' })
  changedByUser: ErpUser | null;

  /**
   * TASK26 — the tool installed by this change is the CURRENTLY ACTIVE tool
   * while `closedAt` is NULL (enforced by a partial unique index: one open
   * change per company + component). Set at removal.
   */
  @Column({ name: 'closed_at', type: 'timestamp with time zone', nullable: true })
  closedAt: Date | null;

  /** TASK26 — existing store issue (material_issues) that supplied this tool. No duplicate stock is created. */
  @Column({ name: 'store_issue_id', type: 'uuid', nullable: true })
  storeIssueId: string | null;

  @ManyToOne(() => MaterialIssue, { nullable: true })
  @JoinColumn({ name: 'store_issue_id' })
  storeIssue: MaterialIssue | null;

  /** TASK26 — destination of the removed tool (RETURN_TO_STORE/SENT_FOR_REWORK/SCRAPPED/LOST/RETAINED/OTHER). */
  @Column({ name: 'disposition_type', type: 'varchar', length: 30, nullable: true })
  dispositionType: string | null;

  @Column({ name: 'disposition_note', type: 'text', nullable: true })
  dispositionNote: string | null;
}