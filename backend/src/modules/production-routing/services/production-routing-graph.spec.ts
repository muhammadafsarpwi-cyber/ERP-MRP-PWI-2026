import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { ProductionRoutingService } from './production-routing.service';
import {
  ProductionRouting,
  RoutingOperation,
  RoutingOperationInput,
  RoutingOperationOutput,
  RoutingOperationConnection,
  RoutingConnectionType,
  RoutingStatus,
} from '../entities';
import { Item } from '../../item/entities/item.entity';
import { ItemRouteType } from '../../item/entities/route-type.entity';
import { BillOfMaterials } from '../../bom/entities/bill-of-materials.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import { Department } from '../../organization/entities/department.entity';
import { Uom } from '../../item/entities/uom.entity';
import { Warehouse } from '../../organization/entities/warehouse.entity';
import { Machine } from '../../production/entities/machine.entity';
import { Operation } from '../../operation/entities/operation.entity';

describe('ProductionRoutingService - Graph & Connections', () => {
  let service: ProductionRoutingService;
  let connectionRepo: jest.Mocked<Repository<RoutingOperationConnection>>;
  let routingRepo: jest.Mocked<Repository<ProductionRouting>>;
  let operationRepo: jest.Mocked<Repository<RoutingOperation>>;

  const companyId = 'test-company-123';
  const routingId = 'routing-uuid-1';

  const mockRouting = {
    id: routingId,
    companyId,
    routingCode: 'RTG-TEST-001',
    routingName: 'Test Routing',
    status: RoutingStatus.DRAFT,
  } as unknown as ProductionRouting;

  const mockOp1 = {
    id: 'op-1',
    routingId,
    companyId,
    sequenceNo: 10,
    operationCode: 'OP-CUT',
    operationName: 'Cutting',
    inputs: [
      {
        id: 'in-1',
        companyId,
        itemId: 'raw-wire-1',
        itemCode: 'RM-WIRE-008',
        itemName: 'Steel Wire Coil',
        quantity: 100,
        uomId: 'kg',
      } as unknown as RoutingOperationInput,
    ],
    outputs: [
      {
        id: 'out-1',
        companyId,
        itemId: 'cut-wire-1',
        itemCode: 'WIP-WIRE-01',
        itemName: 'Cut Wire Rods',
        quantity: 98,
        uomId: 'kg',
      } as unknown as RoutingOperationOutput,
    ],
  } as unknown as RoutingOperation;

  const mockOp2 = {
    id: 'op-2',
    routingId,
    companyId,
    sequenceNo: 20,
    operationCode: 'OP-STR-IN',
    operationName: 'Inner Straightener',
    inputs: [],
    outputs: [],
  } as unknown as RoutingOperation;

  const mockOp3 = {
    id: 'op-3',
    routingId,
    companyId,
    sequenceNo: 30,
    operationCode: 'OP-STR-OUT',
    operationName: 'Outer Straightener',
    inputs: [],
    outputs: [],
  } as unknown as RoutingOperation;

  const mockOp4 = {
    id: 'op-4',
    routingId,
    companyId,
    sequenceNo: 40,
    operationCode: 'OP-ASSY',
    operationName: 'Final Assembly',
    inputs: [],
    outputs: [
      {
        id: 'out-final',
        companyId,
        itemId: 'fin-spoke-1',
        itemCode: 'FG-SPOKE-01',
        itemName: 'Complete Spoke Wheel',
        quantity: 95,
        uomId: 'pcs',
      } as unknown as RoutingOperationOutput,
    ],
  } as unknown as RoutingOperation;

  beforeEach(async () => {
    const mockConnectionRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((dto) => dto),
      save: jest.fn(async (conn) => ({ id: 'conn-saved-id', ...conn })),
      remove: jest.fn(async (conn) => conn),
    };

    const mockRoutingRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const mockOperationRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const mockGenericRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionRoutingService,
        { provide: getRepositoryToken(ProductionRouting), useValue: mockRoutingRepo },
        { provide: getRepositoryToken(RoutingOperation), useValue: mockOperationRepo },
        { provide: getRepositoryToken(RoutingOperationInput), useValue: mockGenericRepo },
        { provide: getRepositoryToken(RoutingOperationOutput), useValue: mockGenericRepo },
        { provide: getRepositoryToken(RoutingOperationConnection), useValue: mockConnectionRepo },
        { provide: getRepositoryToken(Item), useValue: mockGenericRepo },
        { provide: getRepositoryToken(ItemRouteType), useValue: mockGenericRepo },
        { provide: getRepositoryToken(BillOfMaterials), useValue: mockGenericRepo },
        { provide: getRepositoryToken(Division), useValue: mockGenericRepo },
        { provide: getRepositoryToken(Section), useValue: mockGenericRepo },
        { provide: getRepositoryToken(Department), useValue: mockGenericRepo },
        { provide: getRepositoryToken(Uom), useValue: mockGenericRepo },
        { provide: getRepositoryToken(Warehouse), useValue: mockGenericRepo },
        { provide: getRepositoryToken(Machine), useValue: mockGenericRepo },
        { provide: getRepositoryToken(Operation), useValue: mockGenericRepo },
      ],
    }).compile();

    service = module.get<ProductionRoutingService>(ProductionRoutingService);
    connectionRepo = module.get(getRepositoryToken(RoutingOperationConnection));
    routingRepo = module.get(getRepositoryToken(ProductionRouting));
    operationRepo = module.get(getRepositoryToken(RoutingOperation));
  });

  describe('Connection Validation Rules', () => {
    it('1. Rejects self-connection (fromOperationId === toOperationId)', async () => {
      routingRepo.findOne.mockResolvedValue(mockRouting);

      await expect(
        service.createConnection(
          routingId,
          {
            fromOperationId: 'op-1',
            toOperationId: 'op-1',
            connectionType: RoutingConnectionType.SEQUENTIAL,
          },
          companyId,
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('2. Rejects connection if an operation belongs to a different routing or company', async () => {
      routingRepo.findOne.mockResolvedValue(mockRouting);
      operationRepo.findOne
        .mockResolvedValueOnce(mockOp1)
        .mockResolvedValueOnce(null); // toOp is not found in this routing/company

      await expect(
        service.createConnection(
          routingId,
          {
            fromOperationId: 'op-1',
            toOperationId: 'op-2',
            connectionType: RoutingConnectionType.SEQUENTIAL,
          },
          companyId,
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('3. Rejects duplicate identical connection (A -> B)', async () => {
      routingRepo.findOne.mockResolvedValue(mockRouting);
      operationRepo.findOne
        .mockResolvedValueOnce(mockOp1)
        .mockResolvedValueOnce(mockOp2);
      connectionRepo.findOne.mockResolvedValueOnce({
        id: 'existing-conn',
        routingId,
        fromOperationId: 'op-1',
        toOperationId: 'op-2',
      } as RoutingOperationConnection);

      await expect(
        service.createConnection(
          routingId,
          {
            fromOperationId: 'op-1',
            toOperationId: 'op-2',
            connectionType: RoutingConnectionType.SEQUENTIAL,
          },
          companyId,
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('4. Rejects cyclic connection (A -> B -> C -> A)', async () => {
      routingRepo.findOne.mockResolvedValue(mockRouting);
      operationRepo.findOne
        .mockResolvedValueOnce(mockOp3) // from op-3
        .mockResolvedValueOnce(mockOp1); // to op-1 (trying to connect op-3 -> op-1)

      connectionRepo.findOne.mockResolvedValueOnce(null); // No direct duplicate
      // Existing connections: op-1 -> op-2, op-2 -> op-3
      connectionRepo.find.mockResolvedValueOnce([
        { fromOperationId: 'op-1', toOperationId: 'op-2' },
        { fromOperationId: 'op-2', toOperationId: 'op-3' },
      ] as RoutingOperationConnection[]);

      await expect(
        service.createConnection(
          routingId,
          {
            fromOperationId: 'op-3',
            toOperationId: 'op-1',
            connectionType: RoutingConnectionType.SEQUENTIAL,
          },
          companyId,
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Graph Topologies Supported', () => {
    it('5. Successfully creates a Branch (A -> B and A -> C)', async () => {
      routingRepo.findOne.mockResolvedValue(mockRouting);
      // First create A -> B
      operationRepo.findOne
        .mockResolvedValueOnce(mockOp1)
        .mockResolvedValueOnce(mockOp2);
      connectionRepo.findOne.mockResolvedValueOnce(null);
      connectionRepo.find.mockResolvedValueOnce([]);

      const connB = await service.createConnection(
        routingId,
        {
          fromOperationId: 'op-1',
          toOperationId: 'op-2',
          connectionType: RoutingConnectionType.BRANCH,
          branchLabel: 'Inner Branch',
        },
        companyId,
        'user-1',
      );
      expect(connB).toBeDefined();

      // Next create A -> C
      operationRepo.findOne
        .mockResolvedValueOnce(mockOp1)
        .mockResolvedValueOnce(mockOp3);
      connectionRepo.findOne.mockResolvedValueOnce(null);
      connectionRepo.find.mockResolvedValueOnce([
        { fromOperationId: 'op-1', toOperationId: 'op-2' },
      ] as RoutingOperationConnection[]);

      const connC = await service.createConnection(
        routingId,
        {
          fromOperationId: 'op-1',
          toOperationId: 'op-3',
          connectionType: RoutingConnectionType.BRANCH,
          branchLabel: 'Outer Branch',
        },
        companyId,
        'user-1',
      );
      expect(connC).toBeDefined();
    });

    it('6. Successfully creates a Merge (B -> D and C -> D)', async () => {
      routingRepo.findOne.mockResolvedValue(mockRouting);
      // B -> D
      operationRepo.findOne
        .mockResolvedValueOnce(mockOp2)
        .mockResolvedValueOnce(mockOp4);
      connectionRepo.findOne.mockResolvedValueOnce(null);
      connectionRepo.find.mockResolvedValueOnce([]);

      const conn1 = await service.createConnection(
        routingId,
        {
          fromOperationId: 'op-2',
          toOperationId: 'op-4',
          connectionType: RoutingConnectionType.MERGE,
        },
        companyId,
        'user-1',
      );
      expect(conn1).toBeDefined();

      // C -> D
      operationRepo.findOne
        .mockResolvedValueOnce(mockOp3)
        .mockResolvedValueOnce(mockOp4);
      connectionRepo.findOne.mockResolvedValueOnce(null);
      connectionRepo.find.mockResolvedValueOnce([
        { fromOperationId: 'op-2', toOperationId: 'op-4' },
      ] as RoutingOperationConnection[]);

      const conn2 = await service.createConnection(
        routingId,
        {
          fromOperationId: 'op-3',
          toOperationId: 'op-4',
          connectionType: RoutingConnectionType.MERGE,
        },
        companyId,
        'user-1',
      );
      expect(conn2).toBeDefined();
    });

    it('7. Returns complete routing graph with node stats, branch and merge degrees', async () => {
      const routingWithOps = {
        ...mockRouting,
        operations: [mockOp1, mockOp2, mockOp3, mockOp4],
        connections: [
          {
            id: 'c1',
            fromOperationId: 'op-1',
            toOperationId: 'op-2',
            connectionType: RoutingConnectionType.BRANCH,
            branchLabel: 'Inner',
          },
          {
            id: 'c2',
            fromOperationId: 'op-1',
            toOperationId: 'op-3',
            connectionType: RoutingConnectionType.BRANCH,
            branchLabel: 'Outer',
          },
          {
            id: 'c3',
            fromOperationId: 'op-2',
            toOperationId: 'op-4',
            connectionType: RoutingConnectionType.MERGE,
          },
          {
            id: 'c4',
            fromOperationId: 'op-3',
            toOperationId: 'op-4',
            connectionType: RoutingConnectionType.MERGE,
          },
        ],
      } as unknown as ProductionRouting;

      routingRepo.findOne.mockResolvedValue(routingWithOps);

      const graph = await service.getRoutingGraph(routingId, companyId);
      expect(graph).toBeDefined();
      expect(graph.nodes.length).toBe(4);
      expect(graph.edges.length).toBe(4);

      // Node op-1 has outDegree 2 (Branch)
      const nodeOp1 = graph.nodes.find((n: any) => n.id === 'op-1');
      expect(nodeOp1?.outDegree).toBe(2);
      expect(nodeOp1?.inDegree).toBe(0);
      expect(nodeOp1?.inputs.length).toBe(1);
      expect(nodeOp1?.outputs.length).toBe(1);

      // Node op-4 has inDegree 2 (Merge)
      const nodeOp4 = graph.nodes.find((n: any) => n.id === 'op-4');
      expect(nodeOp4?.inDegree).toBe(2);
      expect(nodeOp4?.outDegree).toBe(0);
    });

    it('8. Fallback to synthetic sequential edges for legacy routes without explicit connections', async () => {
      const legacyRouting = {
        ...mockRouting,
        operations: [mockOp1, mockOp2, mockOp4],
        connections: [], // Empty explicit connections
      } as unknown as ProductionRouting;

      routingRepo.findOne.mockResolvedValue(legacyRouting);

      const graph = await service.getRoutingGraph(routingId, companyId);
      expect(graph.edges.length).toBe(2);
      expect(graph.edges[0].isSynthetic).toBe(true);
      expect(graph.edges[0].fromOperationId).toBe('op-1');
      expect(graph.edges[0].toOperationId).toBe('op-2');
      expect(graph.edges[1].fromOperationId).toBe('op-2');
      expect(graph.edges[1].toOperationId).toBe('op-4');
    });
  });
});
