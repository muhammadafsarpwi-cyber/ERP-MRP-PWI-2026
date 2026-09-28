import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Division } from '../../organization/entities/division.entity';
import { HrEmployee } from '../../hr/entities/hr-employee.entity';
import { Location } from './location.entity';

export enum VisitorEntryStatus {
  /** Registered at the gate, Time-In recorded, not yet departed. */
  PENDING = 'PENDING',
  /** Reserved for Prompt #18 (visitor still on site). */
  INSIDE = 'INSIDE',
  /** Reserved for Prompt #18 (Time-Out recorded). */
  COMPLETED = 'COMPLETED',
  /** Registered then cancelled at the gate. */
  CANCELLED = 'CANCELLED',
}

/**
 * Visitor register — `visitor_entries` (migration ERP-00069).
 *
 * Prompt #17 scope: create + list + detail only.
 *   - `timeIn`  is written SERVER-SIDE only (never accepted from the client).
 *   - `timeOut` stays NULL until Prompt #18 (the table + CHECK already allow it).
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

  /** Reserved for Prompt #18 — must stay NULL in this phase. */
  @Column({ name: 'time_out', type: 'timestamp with time zone', nullable: true })
  timeOut: Date | null;

  @Column({ type: 'varchar', length: 20, default: VisitorEntryStatus.PENDING })
  status: VisitorEntryStatus;
}
