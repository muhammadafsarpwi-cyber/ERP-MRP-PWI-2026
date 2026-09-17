import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { ProductionRouting } from './production-routing.entity';
import { RoutingOperation } from './routing-operation.entity';

/** Type of relationship between two production routing operations. */
export enum RoutingConnectionType {
  SEQUENTIAL = 'SEQUENTIAL',
  BRANCH = 'BRANCH',
  MERGE = 'MERGE',
  ASSEMBLY = 'ASSEMBLY',
  PACKING = 'PACKING',
  OUTPUT = 'OUTPUT',
}

@Index(['routingId'])
@Index(['fromOperationId'])
@Index(['toOperationId'])
@Entity('routing_operation_connections')
export class RoutingOperationConnection extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'routing_id', type: 'uuid' })
  routingId: string;

  @ManyToOne(() => ProductionRouting, (r) => r.connections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'routing_id' })
  routing: ProductionRouting;

  @Column({ name: 'from_operation_id', type: 'uuid' })
  fromOperationId: string;

  @ManyToOne(() => RoutingOperation, (op) => op.outgoingConnections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'from_operation_id' })
  fromOperation: RoutingOperation;

  @Column({ name: 'to_operation_id', type: 'uuid' })
  toOperationId: string;

  @ManyToOne(() => RoutingOperation, (op) => op.incomingConnections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'to_operation_id' })
  toOperation: RoutingOperation;

  @Column({
    name: 'connection_type',
    type: 'varchar',
    length: 30,
    default: RoutingConnectionType.SEQUENTIAL,
  })
  connectionType: RoutingConnectionType;

  /** Optional human-friendly branch label (e.g., 'Branch A: Inner Straight', 'Branch B: Outer Straight'). */
  @Column({ name: 'branch_label', type: 'varchar', length: 100, nullable: true })
  branchLabel: string | null;

  @Column({ name: 'order_index', type: 'integer', default: 1 })
  orderIndex: number;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
