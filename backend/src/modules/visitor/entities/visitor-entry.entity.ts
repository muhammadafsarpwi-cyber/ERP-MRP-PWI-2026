import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Division } from '../../organization/entities/division.entity';
import { HrEmployee } from '../../hr/entities/hr-employee.entity';
import { Location } from './location.entity';

export enum VisitorEntryStatus {
  /** Registered at the gate, Time-In recorded, not yet departed. */
  PENDING = 'PENDING',
  /** Visitor confirmed on site. No writer in Prompt #18 — reserved for later phases. */
  INSIDE = 'INSIDE',
  /** Time-Out recorded — the visit is closed and kept as history (§18). */
  COMPLETED = 'COMPLETED',
  /** Registered then cancelled at the gate — never check-out eligible. */
  CANCELLED = 'CANCELLED',
}

/**
 * Visitor register — `visitor_entries` (migration ERP-00069, ERP-00070).
 *
 * One row = one visit (§18). There is no separate history table.
 *   - `timeIn`  is written SERVER-SIDE only (never accepted from the client).
 *   - `timeOut` is written SERVER-SIDE only, exactly once, by the Prompt #18
 *     exit endpoint; `exitedBy` records who did it.
 *   - `status` moves PENDING → COMPLETED on exit and is never reset afterwards.
 *   - `hostEmployeeId` points at the existing employee master, and
 *     `hostNameSnapshot` keeps the record readable after that employee is
 *     renamed or archived.
 *   - `photoPath` is a path inside STORAGE_PATH, deliberately NOT a public URL:
 *     the photo is served only through the authorised GET .../photo endpoint.
 */
@Entity('visitor_entries')
export class VisitorEntry extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'division_id', type: 'uuid' })
  divisionId: string;

  @ManyToOne(() => Division, { nullable: true })
  @JoinColumn({ name: 'division_id' })
  division: Division;

  @Column({ name: 'location_id', type: 'uuid' })
  locationId: string;

  @ManyToOne(() => Location, { nullable: true })
  @JoinColumn({ name: 'location_id' })
  location: Location;

  @Column({ name: 'visitor_name', type: 'varchar', length: 255 })
  visitorName: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  cnic: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  mobile: string | null;

  @Column({ name: 'visitor_company', type: 'varchar', length: 255, nullable: true })
  visitorCompany: string | null;

  /** Person being visited — reference to the existing employee master. */
  @Column({ name: 'host_employee_id', type: 'uuid', nullable: true })
  hostEmployeeId: string | null;

  @ManyToOne(() => HrEmployee, { nullable: true })
  @JoinColumn({ name: 'host_employee_id' })
  hostEmployee: HrEmployee | null;

  /** Copy of the host's name at registration time (historical accuracy). */
  @Column({ name: 'host_name_snapshot', type: 'varchar', length: 255, nullable: true })
  hostNameSnapshot: string | null;

  @Column({ name: 'photo_path', type: 'varchar', length: 500, nullable: true })
  photoPath: string | null;

  @Column({ name: 'photo_mime', type: 'varchar', length: 100, nullable: true })
  photoMime: string | null;

  /** Server-generated. Never read from the request payload. */
  @Column({ name: 'time_in', type: 'timestamp with time zone' })
  timeIn: Date;

  /**
   * Server-generated Time-Out (Prompt #18). NULL while the visitor is still on
   * site; written once by `VisitorEntryService.checkOut` and never overwritten.
   */
  @Column({ name: 'time_out', type: 'timestamp with time zone', nullable: true })
  timeOut: Date | null;

  /**
   * Who recorded the Time-Out (migration ERP-00070, §17).
   *
   * `updated_by`/`updated_at` alone are not enough: a later photo upload bumps
   * them, which would erase the record of who checked the visitor out. Same
   * shape as `created_by` (plain uuid, no FK).
   */
  @Column({ name: 'exited_by', type: 'uuid', nullable: true })
  exitedBy: string | null;

  @Column({ type: 'varchar', length: 20, default: VisitorEntryStatus.PENDING })
  status: VisitorEntryStatus;
}
