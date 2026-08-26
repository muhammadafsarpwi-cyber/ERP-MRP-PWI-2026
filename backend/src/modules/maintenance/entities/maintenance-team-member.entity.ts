import { Entity, Column, ManyToOne, JoinColumn, Index, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { ErpUser } from '../../user/entities/erp-user.entity';
import { MaintenanceTeam } from './maintenance-team.entity';

@Entity('maintenance_team_members')
@Index(['teamId'])
@Index(['userId'])
export class MaintenanceTeamMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @Column({ name: 'team_id', type: 'uuid' })
  teamId: string;

  @ManyToOne(() => MaintenanceTeam, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'team_id' })
  team: MaintenanceTeam;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => ErpUser)
  @JoinColumn({ name: 'user_id' })
  user: ErpUser;

  @Column({ name: 'role', type: 'varchar', length: 50, default: 'MEMBER' })
  role: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
