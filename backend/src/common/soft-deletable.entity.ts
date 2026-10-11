import { Column, DeleteDateColumn } from 'typeorm';
import { BaseEntity } from './base.entity';

/**
 * Universal soft-delete (Recycle Bin) base.
 *
 * A row that carries a `deletedAt` is in the Trash: it is invisible to every
 * `find` / `findOne` / `count` / QueryBuilder call TypeORM issues for that
 * entity (they all gain an implicit `WHERE deleted_at IS NULL`), yet the
 * physical row and every FK that points at it survive untouched. Nothing is
 * ever destroyed by a stray click — recovery is always one UPDATE away.
 *
 * `deletedBy` is deliberately a plain nullable column rather than a relation:
 * the operator profile that fired the delete is an AUDIT FACT about a moment
 * in time and must keep rendering in the bin grid even after that user row is
 * itself removed. Joining it would silently blank the "Deleted By" column for
 * exactly the rows an auditor most needs to identify.
 *
 * Entities opt in by extending this instead of `BaseEntity`. The physical
 * columns are added by
 * `database/migrations/1806000000000-AddSoftDeleteColumns.ts`.
 */
export abstract class SoftDeletableEntity extends BaseEntity {
  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'timestamp with time zone',
    nullable: true,
  })
  deletedAt: Date | null;

  @Column({ name: 'deleted_by', type: 'uuid', nullable: true })
  deletedBy: string | null;
}
