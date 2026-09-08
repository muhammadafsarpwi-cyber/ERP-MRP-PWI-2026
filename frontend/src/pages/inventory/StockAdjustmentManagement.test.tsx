import React from 'react';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import StockAdjustmentManagement from './StockAdjustmentManagement';
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

const mockAdjustments = [
  {
    id: 'adj-draft-1',
    adjustmentNumber: 'SA-2026-001',
    itemId: 'item-1',
    itemName: 'Steel Wire 2.0mm',
    itemCode: 'WIRE-001',
    warehouseId: 'wh-1',
    warehouseName: 'Main Store',
    adjustmentType: 'ADJUSTMENT_IN',
    quantity: 100,
    uomCode: 'KG',
    reason: 'Initial physical surplus count',
    status: 'DRAFT',
    createdBy: 'user-creator-uuid',
    createdByUser: { id: 'user-creator-uuid', displayName: 'Store Keeper' },
    createdAt: new Date().toISOString(),
  },
  {
    id: 'adj-pending-1',
    adjustmentNumber: 'SA-2026-002',
    itemId: 'item-2',
    itemName: 'Galvanized Wire',
    itemCode: 'WIRE-002',
    warehouseId: 'wh-1',
    warehouseName: 'Main Store',
    adjustmentType: 'ADJUSTMENT_OUT',
    quantity: 50,
    uomCode: 'KG',
    reason: 'Physical shortage identified',
    status: 'PENDING_APPROVAL',
    createdBy: 'user-creator-uuid',
    createdByUser: { id: 'user-creator-uuid', displayName: 'Store Keeper' },
    submittedBy: 'user-creator-uuid',
    submittedByUser: { id: 'user-creator-uuid', displayName: 'Store Keeper' },
    submittedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
  {
    id: 'adj-approved-1',
    adjustmentNumber: 'SA-2026-003',
    itemId: 'item-1',
    itemName: 'Steel Wire 2.0mm',
    itemCode: 'WIRE-001',
    warehouseId: 'wh-1',
    warehouseName: 'Main Store',
    adjustmentType: 'ADJUSTMENT_IN',
    quantity: 200,
    uomCode: 'KG',
    reason: 'Annual inventory reconciliation',
    status: 'APPROVED',
    createdBy: 'user-creator-uuid',
    createdByUser: { id: 'user-creator-uuid', displayName: 'Store Keeper' },
    submittedBy: 'user-creator-uuid',
    submittedByUser: { id: 'user-creator-uuid', displayName: 'Store Keeper' },
    approvedBy: 'user-approver-uuid',
    approvedByUser: { id: 'user-approver-uuid', displayName: 'Authorized Approver' },
    approvedAt: new Date().toISOString(),
    approvalRemarks: 'Physically counted and verified',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'adj-posted-1',
    adjustmentNumber: 'SA-2026-004',
    itemId: 'item-1',
    itemName: 'Steel Wire 2.0mm',
    itemCode: 'WIRE-001',
    warehouseId: 'wh-1',
    warehouseName: 'Main Store',
    adjustmentType: 'ADJUSTMENT_IN',
    quantity: 50,
    uomCode: 'KG',
    reason: 'Stock correction verified',
    status: 'POSTED',
    createdBy: 'user-creator-uuid',
    approvedBy: 'user-approver-uuid',
    postedBy: 'user-approver-uuid',
    postedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
];

function setupApiMock(customAdjustments = mockAdjustments) {
  apiMock.get.mockImplementation(async (url: any) => {
    const u = String(url);
    if (u === '/inventory/adjustments/counts') {
      return {
        data: {
          total: 4,
          draft: 1,
          pendingApproval: 1,
          approved: 1,
          returned: 0,
          rejected: 0,
          posted: 1,
        },
      } as any;
    }
    if (u === '/master-data/items') return { data: [{ id: 'item-1', name: 'Steel Wire 2.0mm', itemCode: 'WIRE-001' }] } as any;
    if (u === '/warehouses') return { data: [{ id: 'wh-1', name: 'Main Store', warehouseCode: 'WH-01' }] } as any;
    if (u === '/inventory/adjustments') {
      return { data: customAdjustments, total: customAdjustments.length } as any;
    }
    if (u.includes('/impact')) {
      return {
        data: {
          adjustmentId: 'adj-1',
          adjustmentCode: 'SA-2026-002',
          status: 'PENDING_APPROVAL',
          itemId: 'item-2',
          itemName: 'Galvanized Wire',
          itemCode: 'WIRE-002',
          warehouseId: 'wh-1',
          warehouseName: 'Main Store',
          uom: 'KG',
          currentStock: 1250,
          reservedStock: 100,
          availableStock: 1150,
          adjustmentType: 'ADJUSTMENT_OUT',
          adjustmentQuantity: 50,
          projectedStock: 1200,
          projectedAvailableStock: 1100,
          willCauseNegativeStock: false,
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
}

function renderComponent(props = {}) {
  return render(
    <App>
      <MemoryRouter>
        <StockAdjustmentManagement {...props} />
      </MemoryRouter>
    </App>
  );
}

describe('StockAdjustmentManagement — Complete Approval & Posting Workflow UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.id = 'user-approver-uuid';
    setupApiMock();
  });

  afterEach(() => {
    mockUser.id = 'user-approver-uuid';
    cleanup();
  });

  it('renders the header, description, and status tabs with live counts', async () => {
    renderComponent();

    expect(await screen.findByText(/Stock Adjustments & Reconciliation/i)).toBeInTheDocument();
    expect(screen.getByText(/All Adjustments \(4\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Pending Approval/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/Drafts \(1\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Approved/i)[0]).toBeInTheDocument();
  });

  it('displays adjustment records with correct statuses, tags, and action buttons', async () => {
    renderComponent();

    expect(await screen.findByText('SA-2026-001')).toBeInTheDocument();
    expect(screen.getByText('SA-2026-002')).toBeInTheDocument();
    expect(screen.getByText('SA-2026-003')).toBeInTheDocument();
    expect(screen.getByText('SA-2026-004')).toBeInTheDocument();

    // Verify Review button for pending approval record
    const reviewButtons = screen.getAllByRole('button', { name: /review/i });
    expect(reviewButtons.length).toBeGreaterThan(0);

    // Verify Post button for approved record
    const postButtons = screen.getAllByRole('button', { name: /post/i });
    expect(postButtons.length).toBeGreaterThan(0);
  });

  it('opens dedicated Review / Approval modal when clicking Review on a pending adjustment', async () => {
    renderComponent();

    const reviewButton = await screen.findByRole('button', { name: /review/i });
    fireEvent.click(reviewButton);

    expect(await screen.findByText(/Stock Adjustment Approval — SA-2026-002/i)).toBeInTheDocument();
    expect(screen.getByText(/Live Stock Impact/i)).toBeInTheDocument();
    expect(screen.getByText(/Workflow History/i)).toBeInTheDocument();

    // Verify action buttons in approval modal
    expect(screen.getByRole('button', { name: /return to creator/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject adjustment/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve adjustment/i })).toBeInTheDocument();
  });

  it('enforces Segregation of Duties: warns and blocks approval if current user created or submitted adjustment', async () => {
    // Current user created adj-pending-1
    mockUser.id = 'user-creator-uuid';
    renderComponent();

    const reviewButton = await screen.findByRole('button', { name: /review/i });
    fireEvent.click(reviewButton);

    expect(await screen.findByText(/Segregation of Duties Enforcement/i)).toBeInTheDocument();
    expect(
      screen.getByText(/You are the creator\/submitter of this adjustment.*different authorized user must review/i)
    ).toBeInTheDocument();

    const approveButton = screen.getByRole('button', { name: /approve adjustment/i });
    expect(approveButton).toBeDisabled();
  });

  it('opens Return dialog when Return to Creator is clicked, enforcing mandatory reason', async () => {
    renderComponent();

    const reviewButton = await screen.findByRole('button', { name: /review/i });
    fireEvent.click(reviewButton);

    const returnButton = await screen.findByRole('button', { name: /return to creator/i });
    fireEvent.click(returnButton);

    expect(await screen.findByText(/Return Stock Adjustment to Creator/i)).toBeInTheDocument();
    expect(screen.getByText(/Return Reason \*/i)).toBeInTheDocument();
  });

  it('opens Reject dialog when Reject Adjustment is clicked, enforcing mandatory reason', async () => {
    renderComponent();

    const reviewButton = await screen.findByRole('button', { name: /review/i });
    fireEvent.click(reviewButton);

    const rejectButton = await screen.findByRole('button', { name: /reject adjustment/i });
    fireEvent.click(rejectButton);

    expect(await screen.findByText(/Reject Stock Adjustment Permanently/i)).toBeInTheDocument();
    expect(screen.getByText(/Rejection Reason \*/i)).toBeInTheDocument();
  });

  it('opens Post modal for approved adjustment showing before/after stock impact and atomic notice', async () => {
    renderComponent();

    const postButton = await screen.findByRole('button', { name: /post/i });
    fireEvent.click(postButton);

    expect(await screen.findByText(/Post Stock Adjustment to Inventory/i)).toBeInTheDocument();
    expect(screen.getByText(/Atomic Ledger Transaction/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm & post to inventory/i })).toBeInTheDocument();
  });

  it('opens Detail modal showing full audit info and workflow history timeline', async () => {
    renderComponent();

    const viewButton = (await screen.findAllByRole('button', { name: /view adjustment details/i }))[0];
    fireEvent.click(viewButton);

    expect(await screen.findByText(/Adjustment Details — SA-2026-001/i)).toBeInTheDocument();
    expect(screen.getByText(/Created By:/i)).toBeInTheDocument();
    expect(screen.getByText(/Submitted By:/i)).toBeInTheDocument();
    expect(screen.getByText(/Approved By:/i)).toBeInTheDocument();
    expect(screen.getByText(/Posted By:/i)).toBeInTheDocument();
  });
});
