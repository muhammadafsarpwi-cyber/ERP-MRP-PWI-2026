import React from 'react';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import StockTransferManagement from './StockTransferManagement';
import apiService from '../../services/api';

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

// Mock usePermission hook
const mockUser = {
  id: 'user-approver-uuid',
  email: 'approver@erp.local',
  displayName: 'Authorized Approver',
  defaultCompanyId: 'company-1',
};

jest.mock('../../hooks/usePermission', () => ({
  usePermission: () => ({
    user: mockUser,
    can: (perm: string) => true,
    isLoaded: true,
  }),
}));

jest.setTimeout(30000);

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

const mockTransfers = [
  {
    id: 'trf-draft-1',
    transferNumber: 'TRF-2026-001',
    transferCode: 'TRF-2026-001',
    itemId: 'item-1',
    itemName: 'Steel Wire 2.0mm',
    itemCode: 'WIRE-001',
    fromWarehouseId: 'wh-1',
    fromWarehouseName: 'Main Store',
    toWarehouseId: 'wh-2',
    toWarehouseName: 'Production Store',
    quantity: 100,
    uomCode: 'KG',
    status: 'DRAFT',
    notes: 'Draft relocation',
    createdBy: 'user-creator-uuid',
    createdByUser: { id: 'user-creator-uuid', displayName: 'Store Keeper' },
    createdAt: new Date().toISOString(),
  },
  {
    id: 'trf-pending-1',
    transferNumber: 'TRF-2026-002',
    transferCode: 'TRF-2026-002',
    itemId: 'item-2',
    itemName: 'Galvanized Wire',
    itemCode: 'WIRE-002',
    fromWarehouseId: 'wh-1',
    fromWarehouseName: 'Main Store',
    toWarehouseId: 'wh-2',
    toWarehouseName: 'Lahore Warehouse',
    quantity: 50,
    uomCode: 'KG',
    status: 'PENDING_APPROVAL',
    notes: 'Relocate for assembly',
    createdBy: 'user-creator-uuid',
    createdByUser: { id: 'user-creator-uuid', displayName: 'Store Keeper' },
    submittedBy: 'user-creator-uuid',
    submittedByUser: { id: 'user-creator-uuid', displayName: 'Store Keeper' },
    submittedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
  {
    id: 'trf-approved-1',
    transferNumber: 'TRF-2026-003',
    transferCode: 'TRF-2026-003',
    itemId: 'item-1',
    itemName: 'Steel Wire 2.0mm',
    itemCode: 'WIRE-001',
    fromWarehouseId: 'wh-1',
    fromWarehouseName: 'Main Store',
    toWarehouseId: 'wh-2',
    toWarehouseName: 'Production Store',
    quantity: 200,
    uomCode: 'KG',
    status: 'APPROVED',
    notes: 'Stock transfer approved',
    createdBy: 'user-creator-uuid',
    createdByUser: { id: 'user-creator-uuid', displayName: 'Store Keeper' },
    submittedBy: 'user-creator-uuid',
    submittedByUser: { id: 'user-creator-uuid', displayName: 'Store Keeper' },
    submittedAt: new Date().toISOString(),
    approvedBy: 'user-approver-uuid',
    approvedByUser: { id: 'user-approver-uuid', displayName: 'Authorized Approver' },
    approvedAt: new Date().toISOString(),
    approvalRemarks: 'Transfer approved',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'trf-posted-1',
    transferNumber: 'TRF-2026-004',
    transferCode: 'TRF-2026-004',
    itemId: 'item-1',
    itemName: 'Steel Wire 2.0mm',
    itemCode: 'WIRE-001',
    fromWarehouseId: 'wh-1',
    fromWarehouseName: 'Main Store',
    toWarehouseId: 'wh-2',
    toWarehouseName: 'Production Store',
    quantity: 150,
    uomCode: 'KG',
    status: 'POSTED',
    notes: 'Completed transfer',
    createdBy: 'user-creator-uuid',
    createdByUser: { id: 'user-creator-uuid', displayName: 'Store Keeper' },
    submittedBy: 'user-creator-uuid',
    submittedByUser: { id: 'user-creator-uuid', displayName: 'Store Keeper' },
    submittedAt: new Date().toISOString(),
    approvedBy: 'user-approver-uuid',
    approvedByUser: { id: 'user-approver-uuid', displayName: 'Authorized Approver' },
    approvedAt: new Date().toISOString(),
    postedBy: 'user-approver-uuid',
    postedByUser: { id: 'user-approver-uuid', displayName: 'Authorized Approver' },
    postedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
];

function setupApiMock(customTransfers: any[] = mockTransfers) {
  apiMock.get.mockImplementation(async (u: string) => {
    if (u === '/inventory/transfers/counts') {
      return {
        data: {
          total: 4,
          all: 4,
          draft: 1,
          pendingApproval: 1,
          approved: 1,
          returned: 0,
          rejected: 0,
          posted: 1,
        },
      } as any;
    }
    if (u === '/master-data/items') {
      return {
        data: [
          { id: 'item-1', name: 'Steel Wire 2.0mm', itemCode: 'WIRE-001' },
          { id: 'item-2', name: 'Galvanized Wire', itemCode: 'WIRE-002' },
        ],
      } as any;
    }
    if (u === '/warehouses') {
      return {
        data: [
          { id: 'wh-1', name: 'Main Store', warehouseCode: 'WH-01' },
          { id: 'wh-2', name: 'Production Store', warehouseCode: 'WH-02' },
        ],
      } as any;
    }
    if (u === '/inventory/transfers') {
      return { data: customTransfers, total: customTransfers.length } as any;
    }
    if (u.includes('/impact')) {
      return {
        data: {
          transferId: 'trf-pending-1',
          transferCode: 'TRF-2026-002',
          status: 'PENDING_APPROVAL',
          hasLine: true,
          item: {
            id: 'item-2',
            itemCode: 'WIRE-002',
            name: 'Galvanized Wire',
            uom: 'KG',
          },
          source: {
            warehouseId: 'wh-1',
            warehouseName: 'Main Store',
            onHand: 100,
            available: 100,
            transferQty: 50,
            projectedBalance: 50,
          },
          destination: {
            warehouseId: 'wh-2',
            warehouseName: 'Lahore Warehouse',
            onHand: 20,
            available: 20,
            transferQty: 50,
            projectedBalance: 70,
          },
          isSufficient: true,
          negativeStockAllowed: false,
        },
      } as any;
    }
    if (u.includes('/history')) {
      return {
        data: [
          {
            id: 'h-1',
            action: 'CREATED',
            fromStatus: null,
            toStatus: 'DRAFT',
            performedBy: 'user-creator-uuid',
            performedByUser: { displayName: 'Store Keeper' },
            remarks: 'Initial draft',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'h-2',
            action: 'SUBMITTED',
            fromStatus: 'DRAFT',
            toStatus: 'PENDING_APPROVAL',
            performedBy: 'user-creator-uuid',
            performedByUser: { displayName: 'Store Keeper' },
            remarks: 'Submitted for verification',
            createdAt: new Date().toISOString(),
          },
        ],
      } as any;
    }
    return { data: [] } as any;
  });

  apiMock.patch.mockResolvedValue({ success: true, data: { status: 'APPROVED' } } as any);
  apiMock.post.mockResolvedValue({ success: true, data: { id: 'new-trf-id' } } as any);
  apiMock.delete.mockResolvedValue({ success: true } as any);
}

function renderComponent(props = {}) {
  return render(
    <App>
      <MemoryRouter>
        <StockTransferManagement {...props} />
      </MemoryRouter>
    </App>
  );
}

describe('StockTransferManagement — Complete Approval & Posting Workflow UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.id = 'user-approver-uuid';
    setupApiMock();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders page header, description, and status tabs with counts', async () => {
    renderComponent();

    expect(screen.getByText('Stock Transfers & Relocation')).toBeInTheDocument();
    expect(screen.getByText(/Manage inter-warehouse inventory transfers/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('All Transfers')).toBeInTheDocument();
      expect(screen.getByText('Pending Approval')).toBeInTheDocument();
      expect(screen.getByText('Drafts')).toBeInTheDocument();
      expect(screen.getByText('Approved')).toBeInTheDocument();
      expect(screen.getByText('Posted to Ledger')).toBeInTheDocument();
    });
  });

  it('renders table rows with transfer codes, items, and status tags', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('TRF-2026-001')).toBeInTheDocument();
      expect(screen.getByText('TRF-2026-002')).toBeInTheDocument();
      expect(screen.getByText('TRF-2026-003')).toBeInTheDocument();
      expect(screen.getByText('TRF-2026-004')).toBeInTheDocument();
    });

    // Check status tags (present in both tabs and table status tags)
    expect(screen.getAllByText('Draft').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Pending Approval').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Approved').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Posted to Ledger').length).toBeGreaterThanOrEqual(1);
  });

  it('renders status-aware action buttons: Review for pending, Post for approved', async () => {
    renderComponent();

    await waitFor(() => {
      // Review button for PENDING_APPROVAL
      const reviewButtons = screen.getAllByRole('button', { name: /Review/i });
      expect(reviewButtons.length).toBeGreaterThan(0);

      // Post button for APPROVED
      const postButtons = screen.getAllByRole('button', { name: /Post/i });
      expect(postButtons.length).toBeGreaterThan(0);
    });
  });

  it('opens Review modal when clicking Review on Pending Approval transfer', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('TRF-2026-002')).toBeInTheDocument();
    });

    const reviewButton = await screen.findByRole('button', { name: /Review/i });
    fireEvent.click(reviewButton);

    await waitFor(() => {
      expect(screen.getByText(/Review Stock Transfer/i)).toBeInTheDocument();
      expect(screen.getByText(/Projected Inventory Impact/i)).toBeInTheDocument();
      expect(screen.getByText('Approve Transfer')).toBeInTheDocument();
      expect(screen.getByText('Return to Requester')).toBeInTheDocument();
      expect(screen.getByText('Reject Transfer')).toBeInTheDocument();
    });
  });

  it('enforces Segregation of Duties: warns and disables approval if current user created or submitted transfer', async () => {
    // Current user created trf-pending-1
    mockUser.id = 'user-creator-uuid';
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('TRF-2026-002')).toBeInTheDocument();
    });

    const reviewButton = await screen.findByRole('button', { name: /Review/i });
    fireEvent.click(reviewButton);

    await waitFor(() => {
      expect(screen.getByText(/Segregation of Duties Enforcement/i)).toBeInTheDocument();
      const approveBtn = screen.getByRole('button', { name: /Approve Transfer/i });
      expect(approveBtn).toBeDisabled();
    });
  });

  it('opens Post modal when clicking Post on Approved transfer', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('TRF-2026-003')).toBeInTheDocument();
    });

    const postButton = screen.getByRole('button', { name: /Post/i });
    fireEvent.click(postButton);

    await waitFor(() => {
      expect(screen.getByText(/Post Stock Transfer to Inventory Ledger/i)).toBeInTheDocument();
      expect(screen.getByText(/Atomic Dual-Warehouse Transaction/i)).toBeInTheDocument();
      expect(screen.getByText('Confirm & Post to Inventory')).toBeInTheDocument();
    });
  });
});
