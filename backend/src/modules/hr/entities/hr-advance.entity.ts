import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { HrEmployee } from './hr-employee.entity';

/**
 * Employee Advances (HR-09). One request per (company, employee, request date).
 * All money is DECIMAL(19,4) — never JS float arithmetic on stored balances.
 * `outstanding_amount` is NOT stored: it is always derived as
 * (disbursed_amount - recovered_amount) in SQL and exposed read-only.
 *
 * Status lifecycle (final HR-09/B model): PENDING -> APPROVED / REJECTED /
 * CANCELLED; APPROVED -> DISBURSED (one full disbursement); DISBURSED ->
 * PARTIALLY_RECOVERED -> RECOVERED. New records begin as PENDING. There is no
 * DRAFT / SUBMITTED / FULLY_RECOVERED state.
 *
 * Disbursed/recovered amounts move ONLY through their dedicated services,
 * inside a DB transaction together with the finance journal that records the
 * actual money movement (reference_type = 'EMPLOYEE_ADVANCE', DR 1100 / CR 1000).
 */
@Entity('hr_advances')
export class HrAdvance extends BaseEntity {
  @Column({ name: 'ref_no', type: 'varchar', length: 24 })
  refNo: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => HrEmployee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: HrEmployee;

  @Column({ name: 'request_date', type: 'date' })
  requestDate: Date;

  @Column({ name: 'requested_amount', type: 'numeric', precision: 19, scale: 4 })
  requestedAmount: string | number;

  @Column({ name: 'approved_amount', type: 'numeric', precision: 19, scale: 4, nullable: true })
  approvedAmount: string | number | null;

  @Column({ name: 'disbursed_amount', type: 'numeric', precision: 19, scale: 4, default: 0 })
  disbursedAmount: string | number;

  @Column({ name: 'recovered_amount', type: 'numeric', precision: 19, scale: 4, default: 0 })
  recoveredAmount: string | number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'varchar', length: 255 })
  reason: string;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: string;

  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requestedBy: string | null;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'disbursed_by', type: 'uuid', nullable: true })
  disbursedBy: string | null;

  @Column({ name: 'disbursed_at', type: 'timestamptz', nullable: true })
  disbursedAt: Date | null;

  @Column({ name: 'recovered_by', type: 'uuid', nullable: true })
  recoveredBy: string | null;

  @Column({ name: 'recovered_at', type: 'timestamptz', nullable: true })
  recoveredAt: Date | null;

  @Column({ name: 'decision_remarks', type: 'text', nullable: true })
  decisionRemarks: string | null;
}