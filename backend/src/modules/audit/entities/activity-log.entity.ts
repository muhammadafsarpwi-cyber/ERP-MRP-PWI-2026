import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';

// DEFECT FIXED DURING PROMPT #18 — pre-existing, not introduced by this work.
// `targetType` was mapped WITHOUT an explicit `name`, and this project does not
// run a snake_case NamingStrategy (every other column names its database column
// explicitly — see `BaseEntity`). Postgres therefore rejected EVERY insert with
//   column "targetType" of relation "activity_logs" does not exist
// and `ActivityLogService.log()` swallows that error, so the application-wide
// audit trail was silently empty (0 rows for every target type). Found while
// verifying the visitor exit audit, which Prompt #18 §16 depends on. One mapping
// restores the existing shared audit service for every module that uses it —
// no new audit system, no new table, no behaviour change other than rows
// actually being written.
@Entity('activity_logs')
export class ActivityLog extends BaseEntity {
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column({ name: 'actor_email', type: 'varchar', length: 255, nullable: true })
  actorEmail: string | null;

  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ name: 'target_type', type: 'varchar', length: 100 })
  targetType: string;

  @Column({ name: 'target_id', type: 'varchar', length: 255, nullable: true })
  targetId: string | null;

  @Column({ name: 'target_name', type: 'varchar', length: 255, nullable: true })
  targetName: string | null;

  @Column({ type: 'text', nullable: true })
  details: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;
}
