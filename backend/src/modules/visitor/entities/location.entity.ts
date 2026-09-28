import { Entity, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Division } from '../../organization/entities/division.entity';

export enum LocationStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/**
 * Visitor Management location master — `locations` (migration ERP-00069).
 *
 * This is a NEW, additive master: the pre-existing `warehouse_locations` table
 * hangs off a warehouse and carries no division, so it cannot express the
 * hierarchy this feature needs (Company → Division → Location) and must not be
 * repurposed for visitor locations. Nothing existing was renamed or altered.
 *
 * No rows are seeded — locations are created through the Locations master by an
 * authorised user once the real organizational relationship is confirmed.
 */
@Entity('locations')
@Unique('uq_locations_code_company', ['locationCode', 'companyId'])
export class Location extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  /** Division this location belongs to (Location is always subordinate to Division). */
  @Column({ name: 'division_id', type: 'uuid' })
  divisionId: string;

  @ManyToOne(() => Division, { nullable: true })
  @JoinColumn({ name: 'division_id' })
  division: Division;

  @Column({ name: 'location_code', type: 'varchar', length: 50 })
  locationCode: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: LocationStatus.ACTIVE })
  status: LocationStatus;
}
