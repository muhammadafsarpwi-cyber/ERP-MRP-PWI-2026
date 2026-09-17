import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { RoutingProcessFlow } from './RoutingProcessFlow';
import RoutingManagement from './RoutingManagement';
import apiService from '../../services/api';
import { Routing } from './OperationEditor';

jest.mock('../../services/api');
const apiMock = apiService as jest.Mocked<typeof apiService>;

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

const mockRouting: any = {
  id: 'routing-1',
  routingCode: 'RTG-WIRE-001',
  name: 'Spoke Production Routing',
  status: 'DRAFT',
  productId: 'prod-1',
  baseQuantity: 100,
  operations: [
    {
      id: 'op-1',
      routingId: 'routing-1',
      sequenceNo: 10,
      operationCode: '01-STORES',
      operationName: 'SPI Stores Wire Issue',
      inputs: [
        {
          id: 'in-1',
          itemId: 'wire-coil',
          quantity: 100,
          isPrimary: true,
          item: { id: 'wire-coil', itemCode: 'RM-WIRE-008', name: 'Steel Wire Coil' } as any,
          uom: { id: 'kg', code: 'KG', name: 'Kilograms' } as any,
        } as any,
      ],
      outputs: [
        {
          id: 'out-1',
          itemId: 'wire-issued',
          quantity: 100,
          outputType: 'MAIN',
          item: { id: 'wire-issued', itemCode: 'WIP-WIRE-RAW', name: 'Raw Wire Issued' } as any,
          uom: { id: 'kg', code: 'KG', name: 'Kilograms' } as any,
        } as any,
      ],
    } as any,
    {
      id: 'op-2',
      routingId: 'routing-1',
      sequenceNo: 20,
      operationCode: '02-STR-IN',
      operationName: 'Inner Straightener',
      inputs: [],
      outputs: [],
    } as any,
    {
      id: 'op-3',
      routingId: 'routing-1',
      sequenceNo: 30,
      operationCode: '03-STR-OUT',
      operationName: 'Outer Straightener',
      inputs: [],
      outputs: [],
    } as any,
    {
      id: 'op-4',
      routingId: 'routing-1',
      sequenceNo: 40,
      operationCode: '04-ASSY',
      operationName: 'Final Assembly',
      inputs: [],
      outputs: [
        {
          id: 'out-4',
          itemId: 'fg-spoke',
          quantity: 95,
          outputType: 'MAIN',
          item: { id: 'fg-spoke', itemCode: 'FG-SPOKE-01', name: 'Finished Spokes' } as any,
          uom: { id: 'pcs', code: 'PCS', name: 'Pieces' } as any,
        } as any,
      ],
    } as any,
  ],
};

const mockGraphData = {
  routingId: 'routing-1',
  routingCode: 'RTG-WIRE-001',
  routingName: 'Spoke Production Routing',
  status: 'DRAFT',
  nodes: [
    {
      ...mockRouting.operations![0],
      inDegree: 0,
      outDegree: 2, // Branching into op-2 and op-3
      isBranch: true,
      isMerge: false,
      predecessorIds: [],
      successorIds: ['op-2', 'op-3'],
    },
    {
      ...mockRouting.operations![1],
      inDegree: 1,
      outDegree: 1,
      isBranch: false,
      isMerge: false,
      predecessorIds: ['op-1'],
      successorIds: ['op-4'],
    },
    {
      ...mockRouting.operations![2],
      inDegree: 1,
      outDegree: 1,
      isBranch: false,
      isMerge: false,
      predecessorIds: ['op-1'],
      successorIds: ['op-4'],
    },
    {
      ...mockRouting.operations![3],
      inDegree: 2, // Merging from op-2 and op-3
      outDegree: 0,
      isBranch: false,
      isMerge: true,
      predecessorIds: ['op-2', 'op-3'],
      successorIds: [],
    },
  ],
  edges: [
    {
      id: 'conn-1',
      routingId: 'routing-1',
      fromOperationId: 'op-1',
      toOperationId: 'op-2',
      connectionType: 'BRANCH',
      branchLabel: 'Inner Line',
    },
    {
      id: 'conn-2',
      routingId: 'routing-1',
      fromOperationId: 'op-1',
      toOperationId: 'op-3',
      connectionType: 'BRANCH',
      branchLabel: 'Outer Line',
    },
    {
      id: 'conn-3',
      routingId: 'routing-1',
      fromOperationId: 'op-2',
      toOperationId: 'op-4',
      connectionType: 'MERGE',
      branchLabel: null,
    },
    {
      id: 'conn-4',
      routingId: 'routing-1',
      fromOperationId: 'op-3',
      toOperationId: 'op-4',
      connectionType: 'MERGE',
      branchLabel: null,
    },
  ],
};

describe('RoutingProcessFlow Component', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.delete.mockReset();

    apiMock.get.mockImplementation((url: string) => {
      if (url.includes('/graph')) {
        return Promise.resolve({ data: mockGraphData });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it('1. Renders Process Flow canvas with nodes and zoom toolbar', async () => {
    render(
      <AntApp>
        <RoutingProcessFlow routing={mockRouting} />
      </AntApp>
    );

    await waitFor(() => {
      expect(screen.getByTestId('routing-process-flow')).toBeInTheDocument();
      expect(screen.getByText('01-STORES')).toBeInTheDocument();
      expect(screen.getByText('02-STR-IN')).toBeInTheDocument();
      expect(screen.getByText('03-STR-OUT')).toBeInTheDocument();
      expect(screen.getByText('04-ASSY')).toBeInTheDocument();
    });
  });

  it('2. Renders Branch visualization badge on 01-STORES', async () => {
    render(
      <AntApp>
        <RoutingProcessFlow routing={mockRouting} />
      </AntApp>
    );

    await waitFor(() => {
      expect(screen.getByText(/Split \(2\)/i)).toBeInTheDocument();
    });
  });

  it('3. Renders Merge visualization badge on 04-ASSY', async () => {
    render(
      <AntApp>
        <RoutingProcessFlow routing={mockRouting} />
      </AntApp>
    );

    await waitFor(() => {
      expect(screen.getByText(/Merge \(2\)/i)).toBeInTheDocument();
    });
  });

  it('4. Renders input and output materials with quantity and UOM', async () => {
    render(
      <AntApp>
        <RoutingProcessFlow routing={mockRouting} />
      </AntApp>
    );

    await waitFor(() => {
      expect(screen.getByText('RM-WIRE-008')).toBeInTheDocument();
      expect(screen.getAllByText(/100\.00 KG/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('FG-SPOKE-01')).toBeInTheDocument();
      expect(screen.getByText('95.00 PCS')).toBeInTheDocument();
    });
  });

  it('5. Clicking a node opens the details drawer with connections', async () => {
    render(
      <AntApp>
        <RoutingProcessFlow routing={mockRouting} />
      </AntApp>
    );

    await waitFor(() => {
      expect(screen.getByText('01-STORES')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('01-STORES'));

    await waitFor(() => {
      expect(screen.getByText(/Outgoing Process Connections/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Inner Line/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Outer Line/i).length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('RoutingManagement Segmented Switcher', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/production/routings') {
        return Promise.resolve({ data: [mockRouting], total: 1 });
      }
      if (url.includes('/production/routings/routing-1')) {
        return Promise.resolve({ data: mockRouting });
      }
      if (url.includes('/graph')) {
        return Promise.resolve({ data: mockGraphData });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it('6. Operations List and Process Flow tabs are available in Routing detail', async () => {
    render(
      <AntApp>
        <MemoryRouter>
          <RoutingManagement />
        </MemoryRouter>
      </AntApp>
    );

    // Click View routing button
    await waitFor(() => {
      expect(screen.getByText('RTG-WIRE-001')).toBeInTheDocument();
    });

    const viewBtn = screen.getByRole('button', { name: /eye/i });
    fireEvent.click(viewBtn);

    // Operations List should be visible by default
    await waitFor(() => {
      expect(screen.getByText('Operations List')).toBeInTheDocument();
      expect(screen.getByText('Process Flow')).toBeInTheDocument();
      expect(screen.getByText('SPI Stores Wire Issue')).toBeInTheDocument();
    });

    // Switch to Process Flow
    fireEvent.click(screen.getByText('Process Flow'));

    await waitFor(() => {
      expect(screen.getByTestId('routing-process-flow')).toBeInTheDocument();
    });
  });
});
