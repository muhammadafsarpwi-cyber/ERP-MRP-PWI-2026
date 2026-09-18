import React from 'react';
import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import RawMaterialReceiving from './RawMaterialReceiving';
import RawReceiptMinimizedDock from '../../../components/layout/RawReceiptMinimizedDock';
import { useHeaderActions } from '../../../components/layout/headerActionsStore';
import { useRawReceiptDraftStore, RmDraftLine } from '../../../store/rawReceiptDraftStore';
import apiService from '../../../services/api';

jest.mock('../../../services/api');

jest.setTimeout(120000);

const apiMock = apiService as jest.Mocked<typeof apiService>;

const mockRefData = {
  warehouses: [
    { id: 'wh-1', name: 'Main Raw Material Warehouse', warehouseCode: 'WH-RM-01', status: 'ACTIVE' },
  ],
  items: [
    { id: 'item-ccd-1', itemCode: 'RM-WIRE-001', name: '1.20 mm-84 Wire', baseUomId: 'uom-kg', divisionId: 'div-ccd', itemType: 'RAW_MATERIAL' },
    { id: 'item-ccd-2', itemCode: 'RM-WIRE-002', name: '1.40 mm-84 Wire', baseUomId: 'uom-kg', divisionId: 'div-ccd', itemType: 'RAW_MATERIAL' },
    { id: 'item-pwi-1', itemCode: '271023', name: 'Liquid China Soap', baseUomId: 'uom-kg', divisionId: 'div-pwi', itemType: 'RAW_MATERIAL' },
  ],
  uoms: [{ id: 'uom-kg', code: 'KG', name: 'Kilograms', symbol: 'kg', status: 'ACTIVE' }],
  divisions: [
    { id: 'div-ccd', name: 'Control Cable Division', divisionCode: 'DIV-CCD' },
    { id: 'div-pwi', name: 'Pakistan Wire Industries', divisionCode: 'DIV-PWI' },
  ],
  sections: [
    { id: 'sec-ccd-1', name: 'CCD Cable Plant', sectionCode: 'SEC-CCD-1', divisionId: 'div-ccd' },
    { id: 'sec-ccd-2', name: 'CCD Warehousing', sectionCode: 'SEC-CCD-2', divisionId: 'div-ccd' },
    { id: 'sec-pwi-1', name: 'PWI Store', sectionCode: 'SEC-PWI', divisionId: 'div-pwi' },
  ],
  departments: [
    { id: 'dept-ccd-1', name: 'CCD Stores', departmentCode: 'DEPT-CCD', divisionId: 'div-ccd', sectionId: 'sec-ccd-1' },
    { id: 'dept-pwi-1', name: 'PWI Stores', departmentCode: 'DEPT-PWI', divisionId: 'div-pwi', sectionId: 'sec-pwi-1' },
  ],
  productionOrders: [{ id: 'po-1', order_number: 'PO-2026-001' }],
};

const mockReceipts = [
  {
    id: 'rec-1',
    receiptCode: 'RMR-00001',
    gatePassNo: 'GP-1001',
    receiptDate: '2026-09-14',
    status: 'CONFIRMED',
    division: { id: 'div-ccd', name: 'Control Cable Division', divisionCode: 'DIV-CCD' },
    section: { id: 'sec-ccd-1', name: 'CCD Cable Plant' },
    department: { id: 'dept-ccd-1', name: 'CCD Stores' },
    warehouse: { id: 'wh-1', name: 'Main Raw Material Warehouse' },
    lineCount: 1,
    gatePassTotal: 100.5,
    receivedTotal: 80,
    differenceTotal: 20.5,
    lines: [
      {
        id: 'line-1',
        lineNumber: 1,
        item: { id: 'item-ccd-1', name: '1.20 mm-84 Wire', itemCode: 'RM-WIRE-001' },
        uom: { id: 'uom-kg', code: 'KG' },
        gatePassQuantity: 100.5,
        receivedQuantity: 100.5,
        difference: 0,
      },
    ],
  },
];

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

// Renders the page together with the application-level dock + a harness that
// shows the shared-header actions registered by <PageHeader />.
const renderHarness = (initialEntries = ['/production/receiving']) => {
  const HeaderHarness = () => {
    const extra = useHeaderActions((s) => s.extra);
    return <div data-testid="header-extra">{extra}</div>;
  };
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <App>
        <HeaderHarness />
        <RawMaterialReceiving />
        <RawReceiptMinimizedDock />
      </App>
    </MemoryRouter>
  );
};

const headerButton = (text: string) =>
  within(screen.getByTestId('header-extra')).getByText(text);

// antd puts the Form.Item id on the select's inner search input; climb to the
// `.ant-select` root. Also survives after a value is set (unlike the placeholder).
const selectById = (fieldId: string) =>
  document.querySelector<HTMLElement>(`input[id="${fieldId}"]`)?.closest('.ant-select') ?? null;

const selectedText = (fieldId: string) =>
  selectById(fieldId)?.querySelector('.ant-select-selection-item')?.textContent?.trim() || '';

const openDropdown = (fieldId: string) => {
  const select = selectById(fieldId);
  if (!select) throw new Error(`select #${fieldId} not found`);
  fireEvent.mouseDown(select.querySelector('.ant-select-selector') as HTMLElement);
};

const pickOption = async (labelText: string) => {
  const opt = await screen.findByText(labelText, { selector: '.ant-select-item-option-content' });
  fireEvent.click(opt);
};

// @testing-library's waitFor/findBy* hangs in this jsdom build once an rc-select
// dropdown + auto-fill mutate the tree (MutationObserver storm starves the timer),
// so cheap hand-rolled setTimeout polling is used for cascade assertions.
const pollUntil = async (fn: () => boolean, label: string, tries = 120) => {
  for (let i = 0; i < tries; i += 1) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`pollUntil timed out waiting for: ${label}`);
};

const orgCallCount = () =>
  apiMock.get.mock.calls.filter(
    ([url]) =>
      typeof url === 'string' &&
      (url.includes('/organization/sections') || url.includes('/organization/departments')),
  ).length;

const formDataCallCount = () =>
  apiMock.get.mock.calls.filter(
    ([url]) => typeof url === 'string' && url.includes('/gate-pass/form-data'),
  ).length;

beforeEach(() => {
  jest.clearAllMocks();
  useHeaderActions.getState().clearHeaderMeta();
  useHeaderActions.getState().clearHeaderActions();
  useRawReceiptDraftStore.setState({
    minimized: false,
    pendingRestore: false,
    draft: null,
    refCache: null,
  });
  apiMock.get.mockImplementation((url: string) => {
    if (url === '/inventory/receipts/gate-pass/form-data') {
      return Promise.resolve({ data: mockRefData } as any);
    }
    if (url === '/inventory/receipts/gate-pass') {
      return Promise.resolve({ data: mockReceipts, total: 1 } as any);
    }
    return Promise.resolve({ data: [] } as any);
  });
});

describe('RawMaterialReceiving RMR-01-A', () => {
  it('registers title + header actions (New Receipt / Refresh) into the shared header', async () => {
    renderHarness();

    await screen.findByText('RMR-00001');

    expect(useHeaderActions.getState().title).toBe('Raw Material Receiving');
    expect(useHeaderActions.getState().subtitle).toContain('Inventory increases');
    expect(headerButton('New Receipt (Gate Pass)')).toBeInTheDocument();
    expect(headerButton('Refresh')).toBeInTheDocument();
  });

  it('renders receiving history table with 2-decimal totals', async () => {
    renderHarness();
    await screen.findByText('RMR-00001');
    const row = screen.getByText('RMR-00001').closest('tr') as HTMLElement;
    expect(within(row).getByText('GP-1001')).toBeInTheDocument();
    expect(within(row).getByText('100.5')).toBeInTheDocument();
    expect(within(row).getByText('80')).toBeInTheDocument();
    expect(within(row).getByText('20.5')).toBeInTheDocument();
  });

  it('opens the New Receipt modal with live verification card and empty inputs', async () => {
    renderHarness();
    await screen.findByText('RMR-00001');

    fireEvent.click(headerButton('New Receipt (Gate Pass)'));

    await waitFor(() => {
      expect(screen.getByText('LIVE VERIFICATION (2027)')).toBeInTheDocument();
      expect(screen.getByText('New Raw Material Receipt')).toBeInTheDocument();
      expect(screen.getByText('Active Lines')).toBeInTheDocument();
      expect(screen.getByText('Gate Pass Total')).toBeInTheDocument();
      expect(screen.getByText('Received Total')).toBeInTheDocument();
    });

    const inputs = screen.getAllByPlaceholderText('0.00');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    expect((inputs[0] as HTMLInputElement).value).toBe('');
    expect((inputs[1] as HTMLInputElement).value).toBe('');
  });

it('auto-selects a single Section/Department client-side with zero per-lookup API calls', async () => {
    renderHarness();
    await screen.findByText('RMR-00001');
    fireEvent.click(headerButton('New Receipt (Gate Pass)'));
    await screen.findByText('LIVE VERIFICATION (2027)');

    // DIV-PWI has exactly ONE section/department -> both auto-selected immediately.
    openDropdown('divisionId');
    await pickOption('DIV-PWI — Pakistan Wire Industries');

    await pollUntil(() => selectedText('sectionId') === 'SEC-PWI — PWI Store', 'section auto-select');
    expect(selectedText('sectionId')).toBe('SEC-PWI — PWI Store');
    await pollUntil(() => selectedText('departmentId') === 'DEPT-PWI — PWI Stores', 'department auto-select');
    expect(selectedText('departmentId')).toBe('DEPT-PWI — PWI Stores');

    expect(orgCallCount()).toBe(0);
    expect(formDataCallCount()).toBe(1);
  });

  it('switching Division clears invalid downstream values and does NOT auto-select when multiple sections exist', async () => {
    // Pre-seed a DIV-PWI draft so the page restores it into the modal (this is
    // exactly what the persistent dock does). DIV-CCD has TWO sections, so no
    // auto-selection may occur and the old SEC-PWI value must be cleared.
    useRawReceiptDraftStore.setState({
      draft: {
        editingId: null,
        values: {
          divisionId: 'div-pwi',
          sectionId: 'sec-pwi-1',
          departmentId: 'dept-pwi-1',
        },
        rows: [{ key: 'k1', itemId: 'item-pwi-1', uomId: 'uom-kg' }],
      },
    });
    renderHarness();
    await screen.findByText('RMR-00001');
    await screen.findByText('LIVE VERIFICATION (2027)');

    // Restored DIV-PWI selection is present.
    await pollUntil(() => selectedText('divisionId') === 'DIV-PWI — Pakistan Wire Industries', 'restored division');
    expect(selectedText('sectionId')).toBe('SEC-PWI — PWI Store');
    expect(selectedText('departmentId')).toBe('DEPT-PWI — PWI Stores');

    // Switch to DIV-CCD (multiple sections): downstream values must clear, nothing auto-selects.
    openDropdown('divisionId');
    await pickOption('DIV-CCD — Control Cable Division');

    await pollUntil(() => selectedText('sectionId') === '', 'section cleared after division switch');
    expect(selectedText('sectionId')).toBe('');
    expect(selectedText('departmentId')).toBe('');

    expect(orgCallCount()).toBe(0);
    expect(formDataCallCount()).toBe(1);
  });

  it('never refetches form-data on re-mount (session refCache)', async () => {
    const first = renderHarness();
    await screen.findByText('RMR-00001');
    expect(formDataCallCount()).toBe(1);
    first.unmount();

    renderHarness();
    await screen.findByText('RMR-00001');
    // Second mount reuses the in-memory refCache -> no additional form-data call.
    expect(formDataCallCount()).toBe(1);
    expect(orgCallCount()).toBe(0);
  });

  it('minimizes to the persistent dock, preserves the draft, and restores it', async () => {
    const { unmount } = renderHarness();
    await screen.findByText('RMR-00001');
    fireEvent.click(headerButton('New Receipt (Gate Pass)'));
    await screen.findByText('LIVE VERIFICATION (2027)');

    // Type a real value so we can prove draft preservation.
    const gatePassInput = screen.getByPlaceholderText('e.g. GP-10250');
    fireEvent.change(gatePassInput, { target: { value: 'GP-TEST-9' } });

    fireEvent.click(screen.getByTestId('modal-minimize-btn'));

    // Modal closes, dock appears with draft metadata.
    await waitFor(() => {
      expect(screen.queryByText('LIVE VERIFICATION (2027)')).not.toBeInTheDocument();
      expect(screen.getByTestId('rm-persistent-minimized-bar')).toBeInTheDocument();
    });
    expect(screen.getByTestId('rm-dock-lines').textContent).toContain('draft preserved');
    expect(useRawReceiptDraftStore.getState().minimized).toBe(true);
    expect(useRawReceiptDraftStore.getState().draft?.values?.gatePassNo).toBe('GP-TEST-9');

    // Restore re-opens the same draft with values intact.
    fireEvent.click(screen.getByTestId('rm-dock-restore'));

    await waitFor(() => {
      expect(screen.getByText('LIVE VERIFICATION (2027)')).toBeInTheDocument();
    });
    expect(useRawReceiptDraftStore.getState().minimized).toBe(false);
    expect((screen.getByPlaceholderText('e.g. GP-10250') as HTMLInputElement).value).toBe('GP-TEST-9');

    // Unmounting the page must not destroy the draft (stored at app level).
    unmount();
    expect(useRawReceiptDraftStore.getState().draft).toBeTruthy();
  });

  it('close on the dock discards the draft entirely', async () => {
    renderHarness();
    await screen.findByText('RMR-00001');
    fireEvent.click(headerButton('New Receipt (Gate Pass)'));
    await screen.findByText('LIVE VERIFICATION (2027)');
    fireEvent.click(screen.getByTestId('modal-minimize-btn'));
    await screen.findByTestId('rm-persistent-minimized-bar');

    fireEvent.click(screen.getByTestId('rm-dock-close'));

    await waitFor(() => {
      expect(screen.queryByTestId('rm-persistent-minimized-bar')).not.toBeInTheDocument();
    });
    expect(useRawReceiptDraftStore.getState().draft).toBeNull();
  });
});

describe('RawMaterialReceiving RMR-01-B — photos, attachments, WhatsApp', () => {
  // Seeded draft fully restores into the modal with no dropdown interaction.
  const seedOpenDraft = (extra: {
    values?: Record<string, unknown>;
    rows?: RmDraftLine[];
    pendingFiles?: any[];
    editingId?: string | null;
  } = {}) => {
    useRawReceiptDraftStore.setState({
      draft: {
        editingId: extra.editingId ?? null,
        values: {
          divisionId: 'div-pwi',
          sectionId: 'sec-pwi-1',
          departmentId: 'dept-pwi-1',
          warehouseId: 'wh-1',
          ...(extra.values || {}),
        },
        rows: extra.rows || [
          { key: 'k1', itemId: 'item-pwi-1', uomId: 'uom-kg', gatePassQuantity: 50, receivedQuantity: 10 },
        ],
        pendingFiles: extra.pendingFiles || [],
      },
    });
  };

  const makeFile = (name: string, mime: string, size = 1234): File =>
    new File([new Uint8Array(size)], name, { type: mime });

  const selectFiles = (testId: string, files: File[]) => {
    const input = screen.getByTestId(testId) as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    fireEvent.change(input);
  };

  const confirmReceipt = () => fireEvent.click(screen.getByRole('button', { name: 'Confirm Receipt' }));

  const detailGet = (overrides: Record<string, unknown> = {}) => {
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/inventory/receipts/gate-pass/form-data') return Promise.resolve({ data: mockRefData } as any);
      if (url === '/inventory/receipts/gate-pass') return Promise.resolve({ data: mockReceipts, total: 1 } as any);
      if (url === '/inventory/receipts/gate-pass/rec-1') {
        return Promise.resolve({
          data: {
            id: 'rec-1',
            receiptCode: 'RMR-00001',
            gatePassNo: 'GP-1001',
            receiptDate: '2026-09-14',
            status: 'CONFIRMED',
            division: { id: 'div-ccd', name: 'Control Cable Division', divisionCode: 'DIV-CCD' },
            section: { id: 'sec-ccd-1', name: 'CCD Cable Plant' },
            department: { id: 'dept-ccd-1', name: 'CCD Stores' },
            warehouse: { id: 'wh-1', name: 'Main Raw Material Warehouse' },
            gatePassTotal: 100.5,
            receivedTotal: 80,
            differenceTotal: 20.5,
            lines: [
              {
                id: 'line-1', lineNumber: 1,
                item: { id: 'item-ccd-1', name: '1.20 mm-84 Wire', itemCode: 'RM-WIRE-001' },
                uom: { id: 'uom-kg', code: 'KG' },
                gatePassQuantity: 100.5, receivedQuantity: 80, difference: 20.5,
              },
            ],
            documents: [
              { id: 'doc-photo-1', kind: 'PHOTO', fileName: 'goods.jpg', fileUrl: '/uploads/receipts/rec-1/a.jpg', fileSize: 1234 },
              { id: 'doc-att-1', kind: 'ATTACHMENT', fileName: 'invoice.pdf', fileUrl: '/uploads/receipts/rec-1/b.pdf', fileSize: 5120 },
            ],
            ...overrides,
          },
        } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });
  };

  it('validates photos, shows a pending preview, persists in the draft, and removes it', async () => {
    seedOpenDraft();
    renderHarness();
    await screen.findByText('LIVE VERIFICATION (2027)');

    selectFiles('rm-photo-input', [makeFile('goods.jpg', 'image/jpeg', 1234)]);

    await waitFor(() => expect(screen.getByText('goods.jpg')).toBeInTheDocument());
    expect(screen.getByText('1.2 KB')).toBeInTheDocument();
    expect(document.querySelectorAll('.rmr-pending-photo').length).toBe(1);
    // Sanity: NOTHING is uploaded at selection time.
    expect(apiMock.upload).not.toHaveBeenCalled();
    // The file survives in the draft store (minimize/restore path).
    expect(useRawReceiptDraftStore.getState().draft?.pendingFiles?.length).toBe(1);
    expect(useRawReceiptDraftStore.getState().draft?.pendingFiles?.[0].kind).toBe('PHOTO');

    // A GIF is rejected client-side with a clear warning and is NOT added.
    selectFiles('rm-photo-input', [makeFile('anim.gif', 'image/gif', 10)]);
    await waitFor(() => expect(screen.getByText(/photos must be JPEG\/PNG\/WebP/)).toBeInTheDocument());
    expect(useRawReceiptDraftStore.getState().draft?.pendingFiles?.length).toBe(1);

    // Removing the pending photo clears it everywhere.
    fireEvent.click(screen.getByLabelText('Remove goods.jpg'));
    await waitFor(() => expect(document.querySelectorAll('.rmr-pending-photo').length).toBe(0));
    expect(useRawReceiptDraftStore.getState().draft?.pendingFiles?.length).toBe(0);
  });

  it('validates attachments by extension + MIME and accepts PDF/Office files', async () => {
    seedOpenDraft();
    renderHarness();
    await screen.findByText('LIVE VERIFICATION (2027)');

    selectFiles('rm-attach-input', [makeFile('invoice.pdf', 'application/pdf', 5120)]);
    await waitFor(() => expect(screen.getByText('invoice.pdf')).toBeInTheDocument());
    expect(document.querySelectorAll('.rmr-pending-attach').length).toBe(1);

    selectFiles('rm-attach-input', [makeFile('notes.md', 'text/markdown', 100)]);
    await waitFor(() => expect(screen.getByText(/type not allowed/)).toBeInTheDocument());
    expect(useRawReceiptDraftStore.getState().draft?.pendingFiles?.length).toBe(1);
  });

  it('never uploads when the receipt save fails', async () => {
    seedOpenDraft();
    renderHarness();
    await screen.findByText('LIVE VERIFICATION (2027)');

    selectFiles('rm-photo-input', [makeFile('goods.jpg', 'image/jpeg', 1234)]);
    await waitFor(() => expect(screen.getByText('goods.jpg')).toBeInTheDocument());

    apiMock.post.mockRejectedValue(new Error('server refused'));

    confirmReceipt();
    await screen.findByText('Save Failed');

    expect(apiMock.upload).not.toHaveBeenCalled();
    expect(useRawReceiptDraftStore.getState().draft?.pendingFiles?.length).toBe(1);
  });

  it('an already-processed gate pass resolves to an informational success, never re-posts, never uploads', async () => {
    seedOpenDraft({ values: { gatePassNo: 'GP-3199' } });
    renderHarness();
    await screen.findByText('LIVE VERIFICATION (2027)');

    apiMock.post.mockResolvedValue({
      success: true,
      alreadyProcessed: true,
      message: 'Gate Pass already processed in inventory. No duplicate posting was created.',
      data: { id: 'rec-1', receiptCode: 'RMR-00001', alreadyProcessed: true },
    } as any);

    confirmReceipt();

    // Informational success dialog (NOT a confirmation) and NO fake WhatsApp action.
    await screen.findByText('Gate Pass Already Processed');
    expect(screen.getByText('No Duplicate Posting Created')).toBeInTheDocument();
    expect(screen.queryByText('Share on WhatsApp')).not.toBeInTheDocument();

    // Exactly one POST attempt that resolves to the ORIGINAL record, zero uploads.
    expect(apiMock.post).toHaveBeenCalledTimes(1);
    expect(apiMock.upload).not.toHaveBeenCalled();
    expect(apiMock.post).toHaveBeenCalledWith(
      '/inventory/receipts/gate-pass',
      expect.objectContaining({ gatePassNo: 'GP-3199' }),
    );

    // Draft + modal are closed and the original record is listed again.
    await waitFor(() => expect(useRawReceiptDraftStore.getState().draft).toBeNull());
    expect(screen.queryByText('LIVE VERIFICATION (2027)')).not.toBeInTheDocument();
    expect(screen.getAllByText('RMR-00001').length).toBeGreaterThan(0);
  });

  it('uploads pending files AFTER the header save succeeds, then shows success + WhatsApp action', async () => {
    seedOpenDraft();
    renderHarness();
    await screen.findByText('LIVE VERIFICATION (2027)');

    selectFiles('rm-photo-input', [makeFile('goods.jpg', 'image/jpeg', 1234)]);
    selectFiles('rm-attach-input', [makeFile('invoice.pdf', 'application/pdf', 5120)]);
    await waitFor(() => expect(screen.getByText('invoice.pdf')).toBeInTheDocument());

    apiMock.post.mockResolvedValue({ success: true, data: { id: 'rec-new', receiptCode: 'RMR-00002' } });
    apiMock.upload.mockResolvedValue({ success: true, data: { id: 'doc-x' } });

    confirmReceipt();
    await screen.findByText('Share on WhatsApp');

    // Header saved once with the real rows.
    expect(apiMock.post).toHaveBeenCalledTimes(1);
    expect(apiMock.post).toHaveBeenCalledWith(
      '/inventory/receipts/gate-pass',
      expect.objectContaining({ warehouseId: 'wh-1', items: [{ itemId: 'item-pwi-1', uomId: 'uom-kg', gatePassQuantity: 50, receivedQuantity: 10 }] }),
    );

    // Files uploaded to THAT receipt, in order, with kind + file payload.
    expect(apiMock.upload).toHaveBeenCalledTimes(2);
    expect(apiMock.upload.mock.calls[0][0]).toBe('/inventory/receipts/gate-pass/rec-new/documents');
    expect(apiMock.upload.mock.calls[1][0]).toBe('/inventory/receipts/gate-pass/rec-new/documents');
    const fd1 = apiMock.upload.mock.calls[0][1] as FormData;
    expect(fd1.get('kind')).toBe('PHOTO');
    expect((fd1.get('file') as File).name).toBe('goods.jpg');
    const fd2 = apiMock.upload.mock.calls[1][1] as FormData;
    expect(fd2.get('kind')).toBe('ATTACHMENT');
    expect((fd2.get('file') as File).name).toBe('invoice.pdf');

    // Draft fully closed; modal closed.
    expect(useRawReceiptDraftStore.getState().draft).toBeNull();
    expect(screen.queryByText('LIVE VERIFICATION (2027)')).not.toBeInTheDocument();
    expect(screen.getByText('RMR-00002')).toBeInTheDocument();
  });

  it('partial upload failure is honest and Retry uploads ONLY the remaining files', async () => {
    seedOpenDraft();
    renderHarness();
    await screen.findByText('LIVE VERIFICATION (2027)');

    selectFiles('rm-photo-input', [makeFile('goods.jpg', 'image/jpeg', 1234)]);
    selectFiles('rm-attach-input', [makeFile('invoice.pdf', 'application/pdf', 5120)]);
    await waitFor(() => expect(screen.getByText('invoice.pdf')).toBeInTheDocument());

    apiMock.post.mockResolvedValue({ success: true, data: { id: 'rec-new', receiptCode: 'RMR-00002' } });
    let uploadCalls = 0;
    apiMock.upload.mockImplementation(() => {
      uploadCalls += 1;
      if (uploadCalls === 1) return Promise.reject(new Error('network'));
      return Promise.resolve({ success: true, data: { id: 'doc-x' } });
    });

    confirmReceipt();
    // Honest error: receipt saved BUT the photo failed; Retry is upload-only.
    await screen.findByText(/1 of 2 file upload\(s\) failed/);
    expect(screen.getByText(/goods\.jpg/)).toBeInTheDocument();
    expect(apiMock.upload).toHaveBeenCalledTimes(2);
    // Receipt is NOT duplicated and the failing file is still pending.
    expect(apiMock.post).toHaveBeenCalledTimes(1);
    expect(useRawReceiptDraftStore.getState().draft?.pendingFiles?.map((f) => f.name)).toEqual(['goods.jpg']);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Share on WhatsApp');

    // Only the remaining single file was retried, then everything closed.
    expect(apiMock.upload).toHaveBeenCalledTimes(3);
    expect(apiMock.post).toHaveBeenCalledTimes(1);
    expect(useRawReceiptDraftStore.getState().draft).toBeNull();
  });

  it('edit mode lists existing documents and removes one via DELETE', async () => {
    detailGet();
    renderHarness();
    await screen.findByText('RMR-00001');

    const row = screen.getByText('RMR-00001').closest('tr') as HTMLElement;
    const editBtn = (row.querySelector('.anticon-edit') as HTMLElement)?.closest('button') as HTMLElement;
    fireEvent.click(editBtn);

    await screen.findByText('Current documents on file');
    expect(screen.getByText('goods.jpg')).toBeInTheDocument();
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('rm-remove-existing-doc-photo-1'));
    const okBtn = await waitFor(() => {
      const btn = Array.from(document.querySelectorAll('.ant-popover button')).find((b) => b.textContent === 'Remove');
      if (!btn) throw new Error('popconfirm remove button not rendered');
      return btn as HTMLElement;
    });
    fireEvent.click(okBtn);

    await waitFor(() => expect(apiMock.delete).toHaveBeenCalledWith('/inventory/receipts/gate-pass/rec-1/documents/doc-photo-1'));
    await waitFor(() => expect(screen.queryByText('goods.jpg')).not.toBeInTheDocument());
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument();
  });

  it('detail drawer shows documents and shares a real receipt message via WhatsApp', async () => {
    detailGet();
    renderHarness();
    await screen.findByText('RMR-00001');

    const row = screen.getByText('RMR-00001').closest('tr') as HTMLElement;
    const viewBtn = (row.querySelector('.anticon-eye') as HTMLElement)?.closest('button') as HTMLElement;
    fireEvent.click(viewBtn);

    await screen.findByTestId('rm-detail-photo');
    expect(screen.getByTestId('rm-detail-attachment')).toBeInTheDocument();

    apiMock.post.mockResolvedValue({ success: true, data: { enqueued: true, deliveryId: 'del-1' } });
    fireEvent.click(screen.getByTestId('rm-detail-wa'));

    const msgBox = screen.getByTestId('wa-message') as HTMLTextAreaElement;
    expect(msgBox.value).toContain('RAW MATERIAL RECEIVING');
    expect(msgBox.value).toContain('RMR-00001');
    expect(msgBox.value).toContain('RM-WIRE-001');

    fireEvent.change(screen.getByTestId('wa-phone'), { target: { value: '923001234567' } });
    fireEvent.click(screen.getByTestId('wa-send'));

    await screen.findByText(/queued for WhatsApp delivery in the background \(delivery ID del-1\)/);
    expect(apiMock.post).toHaveBeenCalledWith(
      '/inventory/receipts/gate-pass/rec-1/whatsapp-share',
      expect.objectContaining({ phone: '923001234567', message: msgBox.value }),
    );
    // Pre-filled Open WhatsApp link is available.
    expect(screen.getByTestId('wa-open')).toHaveAttribute('href', expect.stringContaining('wa.me/923001234567'));
  });

  it('falls back to wa.me when the WhatsApp provider is unconfigured (no fake sent)', async () => {
    detailGet();
    window.open = jest.fn() as any;
    renderHarness();
    await screen.findByText('RMR-00001');

    const row = screen.getByText('RMR-00001').closest('tr') as HTMLElement;
    const viewBtn = (row.querySelector('.anticon-eye') as HTMLElement)?.closest('button') as HTMLElement;
    fireEvent.click(viewBtn);
    await screen.findByTestId('rm-detail-photo');

    apiMock.post.mockResolvedValue({ success: true, data: { enqueued: false, reason: 'WA_NOT_CONFIGURED' } });
    fireEvent.click(screen.getByTestId('rm-detail-wa'));
    fireEvent.change(screen.getByTestId('wa-phone'), { target: { value: '923001234567' } });
    fireEvent.click(screen.getByTestId('wa-send'));

    await screen.findByText(/opened WhatsApp with the message pre-filled/);
    expect(window.open).toHaveBeenCalledWith(expect.stringContaining('wa.me/923001234567'), '_blank', 'noopener,noreferrer');
  });

  it('copy shows an honest error when the clipboard API is unavailable', async () => {
    detailGet();
    renderHarness();
    await screen.findByText('RMR-00001');

    const row = screen.getByText('RMR-00001').closest('tr') as HTMLElement;
    const viewBtn = (row.querySelector('.anticon-eye') as HTMLElement)?.closest('button') as HTMLElement;
    fireEvent.click(viewBtn);
    await screen.findByTestId('rm-detail-photo');

    fireEvent.click(screen.getByTestId('rm-detail-wa'));
    fireEvent.click(screen.getByTestId('wa-copy'));

    await screen.findByText(/Clipboard is unavailable/);
  });

  it('action column WhatsApp button shares the saved receipt with real item lines, then re-shares (repeat)', async () => {
    detailGet();
    renderHarness();
    await screen.findByText('RMR-00001');

    const row = screen.getByText('RMR-00001').closest('tr') as HTMLElement;
    const waBtn = row.querySelector('[data-testid="rm-action-wa"]') as HTMLElement;
    expect(waBtn).toBeTruthy();
    fireEvent.click(waBtn);

    // The message is built from the REAL detail (fetched like View), not a stub.
    await screen.findByText('Sharing receipt RMR-00001');
    const msgBox = screen.getByTestId('wa-message') as HTMLTextAreaElement;
    expect(msgBox.value).toContain('RAW MATERIAL RECEIVING');
    expect(msgBox.value).toContain('Receipt: RMR-00001');
    expect(msgBox.value).toContain('RM-WIRE-001');
    expect(msgBox.value).toMatch(/Totals — Gate Pass: 100\.5 \| Received: 80 \| Diff: 20\.5/);

    apiMock.post.mockResolvedValue({ success: true, data: { enqueued: true, deliveryId: 'del-2' } });
    fireEvent.change(screen.getByTestId('wa-phone'), { target: { value: '923001234567' } });
    fireEvent.click(screen.getByTestId('wa-send'));
    await screen.findByText(/queued for WhatsApp delivery in the background \(delivery ID del-2\)/);
    expect(apiMock.post).toHaveBeenCalledWith(
      '/inventory/receipts/gate-pass/rec-1/whatsapp-share',
      expect.objectContaining({ phone: '923001234567' }),
    );

    // Close and re-share the SAME receipt — still one receipt row, detail reloaded.
    const waModal = (screen.getByText('Share Receipt on WhatsApp').closest('.ant-modal') as HTMLElement);
    fireEvent.click(waModal.querySelector('.ant-modal-close') as HTMLElement);
    await screen.findByText('RMR-00001');
    fireEvent.click(row.querySelector('[data-testid="rm-action-wa"]') as HTMLElement);
    await screen.findByText('Sharing receipt RMR-00001');
    expect(apiMock.get).toHaveBeenCalledWith('/inventory/receipts/gate-pass/rec-1');
    expect((screen.getByTestId('wa-message') as HTMLTextAreaElement).value).toContain('Receipt: RMR-00001');
  });

  it('action column WhatsApp message includes the full item breakdown and totals for multi-line receipts', async () => {
    detailGet({
      gatePassTotal: 200,
      receivedTotal: 160,
      differenceTotal: 40,
      lines: [
        {
          id: 'line-1', lineNumber: 1,
          item: { id: 'item-ccd-1', name: '1.20 mm-84 Wire', itemCode: 'RM-WIRE-001' },
          uom: { id: 'uom-kg', code: 'KG' },
          gatePassQuantity: 100.5, receivedQuantity: 80, difference: 20.5,
        },
        {
          id: 'line-2', lineNumber: 2,
          item: { id: 'item-ccd-2', name: '1.40 mm-84 Wire', itemCode: 'RM-WIRE-002' },
          uom: { id: 'uom-kg', code: 'KG' },
          gatePassQuantity: 99.5, receivedQuantity: 80, difference: 19.5,
        },
      ],
    });
    renderHarness();
    await screen.findByText('RMR-00001');

    const row = screen.getByText('RMR-00001').closest('tr') as HTMLElement;
    fireEvent.click(row.querySelector('[data-testid="rm-action-wa"]') as HTMLElement);
    // The share is opened on the awaited detail fetch — wait for the modal first.
    await screen.findByText('Sharing receipt RMR-00001');

    const msgBox = screen.getByTestId('wa-message') as HTMLTextAreaElement;
    expect(msgBox.value).toContain('1. RM-WIRE-001 - 1.20 mm-84 Wire (KG)');
    expect(msgBox.value).toContain('2. RM-WIRE-002 - 1.40 mm-84 Wire (KG)');
    expect(msgBox.value).toMatch(/Totals — Gate Pass: 200 \| Received: 160 \| Diff: 40/);
  });
});

describe('RawMaterialReceiving RMR-01-C — Receipt Item Inventory View', () => {
  const inventoryBox = () => within(screen.getByTestId('rm-inventory-body'));

  const openInventoryPopup = async (inventoryData: Record<string, unknown>) => {
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/inventory/receipts/gate-pass/form-data') return Promise.resolve({ data: mockRefData } as any);
      if (url === '/inventory/receipts/gate-pass') return Promise.resolve({ data: mockReceipts, total: 1 } as any);
      if (url === '/inventory/receipts/gate-pass/rec-1') {
        return Promise.resolve({ data: mockReceipts[0] } as any);
      }
      if (url === '/inventory/receipts/gate-pass/rec-1/inventory') {
        return Promise.resolve({ data: inventoryData } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });

    renderHarness();
    await screen.findByText('RMR-00001');
    const row = screen.getByText('RMR-00001').closest('tr') as HTMLElement;
    const viewBtn = (row.querySelector('.anticon-eye') as HTMLElement)?.closest('button') as HTMLElement;
    fireEvent.click(viewBtn);
    await screen.findByTestId('rm-detail-wa');
    fireEvent.click(screen.getByTestId('rm-detail-inventory'));
    await screen.findByTestId('rm-inventory-receipt');
  };

  const baseInventory = {
    receiptCode: 'RMR-00001',
    receiptDate: '2026-09-14',
    status: 'CONFIRMED',
    warehouse: { id: 'wh-1', name: 'Main Raw Material Warehouse' },
    items: [],
  };

  it('shows real on-hand/reserved/available for every received item (single item)', async () => {
    await openInventoryPopup({
      ...baseInventory,
      items: [
        {
          lineNumber: 1,
          item: { id: 'item-ccd-1', itemCode: 'RM-WIRE-001', name: '1.20 mm-84 Wire' },
          uom: { id: 'uom-kg', code: 'KG' },
          receivedQuantity: 80,
          gatePassQuantity: 100.5,
          balance: { exists: true, onHand: 500, reserved: 100, available: 400, lastUpdatedAt: '2026-09-16T09:00:00Z' },
        },
      ],
    });

    expect(inventoryBox().getByTestId('rm-inventory-receipt').textContent).toBe('RMR-00001');
    expect(inventoryBox().getByText('Inventory Status')).toBeInTheDocument();
    expect(inventoryBox().getByText('Inventory for items received in RMR-00001')).toBeInTheDocument();
    expect(inventoryBox().getByText('Main Raw Material Warehouse')).toBeInTheDocument();
    expect(inventoryBox().getByText('RM-WIRE-001')).toBeInTheDocument();
    expect(inventoryBox().getByText('1.20 mm-84 Wire')).toBeInTheDocument();
    // column headers exist (antd may render a hidden measure copy of the header too)
    expect(inventoryBox().getAllByText('Received in This Receipt').length).toBeGreaterThan(0);
    expect(inventoryBox().getAllByText('Current On Hand').length).toBeGreaterThan(0);
    expect(inventoryBox().getAllByText('Received in This Receipt')[0]).not.toHaveTextContent('On Hand');
    expect(inventoryBox().getByText('500')).toBeInTheDocument();
    expect(inventoryBox().getByText('100')).toBeInTheDocument();
    expect(inventoryBox().getByText('400')).toBeInTheDocument();
    expect(inventoryBox().getByText('KG')).toBeInTheDocument();
    // the receipt's own quantity is rendered in its dedicated column, distinct from stock
    expect(inventoryBox().getByText('80')).toBeInTheDocument();

    // a read-only view: one inventory GET, zero mutations
    expect(apiMock.get).toHaveBeenCalledWith('/inventory/receipts/gate-pass/rec-1/inventory');
    expect(apiMock.post).not.toHaveBeenCalled();
    expect(apiMock.patch).not.toHaveBeenCalled();
  });

  it('shows zero stock as 0 when a balance record exists (valid, not fabricated)', async () => {
    await openInventoryPopup({
      ...baseInventory,
      items: [
        {
          lineNumber: 1,
          item: { id: 'item-ccd-1', itemCode: 'RM-WIRE-001', name: '1.20 mm-84 Wire' },
          uom: { id: 'uom-kg', code: 'KG' },
          receivedQuantity: 80,
          gatePassQuantity: 100.5,
          balance: { exists: true, onHand: 0, reserved: 0, available: 0, lastUpdatedAt: '2026-09-16T09:00:00Z' },
        },
      ],
    });

    expect(inventoryBox().queryByTestId('rm-inventory-missing')).not.toBeInTheDocument();
    // on-hand/reserved/available all show real 0 (valid data, and all three cells)
    expect(inventoryBox().getAllByText('0').length).toBeGreaterThanOrEqual(3);
  });

  it('shows a truthful missing-balance message instead of a fake zero', async () => {
    await openInventoryPopup({
      ...baseInventory,
      items: [
        {
          lineNumber: 1,
          item: { id: 'item-ccd-1', itemCode: 'RM-WIRE-001', name: '1.20 mm-84 Wire' },
          uom: { id: 'uom-kg', code: 'KG' },
          receivedQuantity: 80,
          gatePassQuantity: 100.5,
          balance: { exists: false, onHand: null, reserved: null, available: null, lastUpdatedAt: null },
        },
      ],
    });

    expect(inventoryBox().getByTestId('rm-inventory-missing').textContent).toContain('No inventory balance record found');
    // the receipt quantity is still shown with its explicit label (not conflated with stock)
    expect(inventoryBox().getAllByText('Received in This Receipt').length).toBeGreaterThan(0);
  });

  it('renders every line of a multi-item receipt with per-item balances', async () => {
    await openInventoryPopup({
      ...baseInventory,
      items: [
        {
          lineNumber: 1,
          item: { id: 'item-ccd-1', itemCode: 'RM-WIRE-001', name: '1.20 mm-84 Wire' },
          uom: { id: 'uom-kg', code: 'KG' },
          receivedQuantity: 80,
          gatePassQuantity: 100.5,
          balance: { exists: true, onHand: 250, reserved: 50, available: 200, lastUpdatedAt: null },
        },
        {
          lineNumber: 2,
          item: { id: 'item-ccd-2', itemCode: 'RM-WIRE-002', name: '1.40 mm-84 Wire' },
          uom: { id: 'uom-kg', code: 'KG' },
          receivedQuantity: 80,
          gatePassQuantity: 99.5,
          balance: { exists: true, onHand: 0, reserved: 0, available: 0, lastUpdatedAt: '2026-09-15T10:00:00Z' },
        },
      ],
    });

    expect(inventoryBox().getByText('RM-WIRE-001')).toBeInTheDocument();
    expect(inventoryBox().getByText('RM-WIRE-002')).toBeInTheDocument();
    expect(inventoryBox().getByText('250')).toBeInTheDocument();
    expect(inventoryBox().getByText('200')).toBeInTheDocument();
  });

  it('shows a clear error inside the popup and retry refetches fresh data on demand', async () => {
    const calls: Array<[string]> = [];
    apiMock.get.mockImplementation((url: string) => {
      calls.push([url as string]);
      if (url === '/inventory/receipts/gate-pass/form-data') return Promise.resolve({ data: mockRefData } as any);
      if (url === '/inventory/receipts/gate-pass') return Promise.resolve({ data: mockReceipts, total: 1 } as any);
      if (url === '/inventory/receipts/gate-pass/rec-1') return Promise.resolve({ data: mockReceipts[0] } as any);
      if (url === '/inventory/receipts/gate-pass/rec-1/inventory') {
        return Promise.reject({ response: { status: 500 } });
      }
      return Promise.resolve({ data: [] } as any);
    });

    renderHarness();
    await screen.findByText('RMR-00001');
    const row = screen.getByText('RMR-00001').closest('tr') as HTMLElement;
    const viewBtn = (row.querySelector('.anticon-eye') as HTMLElement)?.closest('button') as HTMLElement;
    fireEvent.click(viewBtn);
    await screen.findByTestId('rm-detail-wa');
    fireEvent.click(screen.getByTestId('rm-detail-inventory'));

    await screen.findByTestId('rm-inventory-error');
    // clear error shown, NEVER a fabricated 0 / empty table
    expect(screen.getByTestId('rm-inventory-error').textContent).toContain('Internal server error');
    expect(screen.queryByTestId('rm-inventory-receipt')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rm-inventory-missing')).not.toBeInTheDocument();

    // retry refetches (never a fabricated table on error)
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/inventory/receipts/gate-pass/form-data') return Promise.resolve({ data: mockRefData } as any);
      if (url === '/inventory/receipts/gate-pass') return Promise.resolve({ data: mockReceipts, total: 1 } as any);
      if (url === '/inventory/receipts/gate-pass/rec-1/inventory') {
        return Promise.resolve({ data: { ...baseInventory, items: [
          {
            lineNumber: 1,
            item: { id: 'item-ccd-1', itemCode: 'RM-WIRE-001', name: '1.20 mm-84 Wire' },
            uom: { id: 'uom-kg', code: 'KG' },
            receivedQuantity: 80, gatePassQuantity: 100.5,
            balance: { exists: true, onHand: 500, reserved: 100, available: 400, lastUpdatedAt: null },
          },
        ] } } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });
    fireEvent.click(screen.getByTestId('rm-inventory-retry'));
    await screen.findByTestId('rm-inventory-receipt');
    expect(screen.getByText('500')).toBeInTheDocument();

    // exactly one initial attempt per click/retry
    const inventoryCalls = calls.filter(([u]) => u.endsWith('/inventory')).length;
    expect(inventoryCalls).toBe(1);
  });

  it('opens a centered modal, shows a local loading state without fake zeros, and makes exactly one request', async () => {
    const calls: string[] = [];
    let resolveInv: (payload: any) => void = () => {};
    apiMock.get.mockImplementation((url: string) => {
      calls.push(url as string);
      if (url === '/inventory/receipts/gate-pass/form-data') return Promise.resolve({ data: mockRefData } as any);
      if (url === '/inventory/receipts/gate-pass') return Promise.resolve({ data: mockReceipts, total: 1 } as any);
      if (url === '/inventory/receipts/gate-pass/rec-1') return Promise.resolve({ data: mockReceipts[0] } as any);
      if (url === '/inventory/receipts/gate-pass/rec-1/inventory') return new Promise((res) => { resolveInv = res; });
      return Promise.resolve({ data: [] } as any);
    });

    renderHarness();
    await screen.findByText('RMR-00001');
    const row = screen.getByText('RMR-00001').closest('tr') as HTMLElement;
    fireEvent.click((row.querySelector('.anticon-eye') as HTMLElement).closest('button') as HTMLElement);
    await screen.findByTestId('rm-detail-wa');

    // View Inventory button exists exactly once in the detail actions
    const buttons = screen.getAllByTestId('rm-detail-inventory');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toContain('View Inventory');

    fireEvent.click(buttons[0]);

    // local loading state, no fabrications, no fake zeros while pending
    await screen.findByTestId('rm-inventory-loading');
    expect(within(screen.getByTestId('rm-inventory-body')).queryByTestId('rm-inventory-receipt')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('rm-inventory-body')).queryByText('0')).not.toBeInTheDocument();

    // centered modal (not a drawer), not closable by mask click, explicit X present
    const invModal = document.querySelector('.rmr-inventory-modal') as HTMLElement;
    expect(invModal).not.toBeNull();
    const wrap = invModal.closest('.ant-modal-wrap') as HTMLElement;
    expect(wrap.classList.contains('ant-modal-centered')).toBe(true);
    expect(document.querySelector('.ant-drawer')).not.toBeInTheDocument();
    expect(document.querySelector('.rmr-inventory-modal .ant-modal-close')).toBeInTheDocument();
    expect(String(invModal.getAttribute('style') || '')).toContain('1120');

    resolveInv({ data: {
      ...baseInventory,
      items: [{
        lineNumber: 1,
        item: { id: 'item-ccd-1', itemCode: 'RM-WIRE-001', name: '1.20 mm-84 Wire' },
        uom: { id: 'uom-kg', code: 'KG' },
        receivedQuantity: 80, gatePassQuantity: 100.5,
        balance: { exists: true, onHand: 500, reserved: 100, available: 400, lastUpdatedAt: null },
      }],
    } } as any);

    await waitFor(() => expect(within(screen.getByTestId('rm-inventory-body')).getByTestId('rm-inventory-receipt').textContent).toBe('RMR-00001'));
    const invCalls = calls.filter((u) => u.endsWith('/inventory')).length;
    expect(invCalls).toBe(1);
  });

  it('distinguishes the receipt quantity from the current on-hand quantity', async () => {
    await openInventoryPopup({
      ...baseInventory,
      items: [{
        lineNumber: 1,
        item: { id: 'item-ccd-1', itemCode: 'RM-WIRE-001', name: '1.20 mm-84 Wire' },
        uom: { id: 'uom-kg', code: 'KG' },
        receivedQuantity: 3371.2,
        gatePassQuantity: 3372,
        balance: { exists: true, onHand: 9940, reserved: 0, available: 9940, lastUpdatedAt: null },
      }],
    });

    const box = inventoryBox();
    expect(box.getAllByText('3,371.2').length).toBeGreaterThan(0); // received in this receipt
    expect(box.getAllByText('9,940').length).toBeGreaterThan(0); // current on hand
    expect(box.getAllByText('Received in This Receipt').length).toBeGreaterThan(0);
    expect(box.getAllByText('Current On Hand').length).toBeGreaterThan(0);
    // the two concepts are never merged under a plain "Stock" label
    expect(box.queryByText('Stock')).not.toBeInTheDocument();
  });

  it('shows Reserved/Available only where the balance record actually supports them', async () => {
    await openInventoryPopup({
      ...baseInventory,
      items: [
        {
          lineNumber: 1,
          item: { id: 'item-ccd-1', itemCode: 'RM-WIRE-001', name: '1.20 mm-84 Wire' },
          uom: { id: 'uom-kg', code: 'KG' },
          receivedQuantity: 80, gatePassQuantity: 100.5,
          balance: { exists: false, onHand: null, reserved: null, available: null, lastUpdatedAt: null },
        },
        {
          lineNumber: 2,
          item: { id: 'item-ccd-2', itemCode: 'RM-WIRE-002', name: '1.40 mm-84 Wire' },
          uom: { id: 'uom-kg', code: 'KG' },
          receivedQuantity: 80, gatePassQuantity: 99.5,
          balance: { exists: true, onHand: 500, reserved: 100, available: 400, lastUpdatedAt: null },
        },
      ],
    });

    const box = inventoryBox();
    // item with no balance record: truthful tag + em-dashes (never fabricated 0)
    expect(box.getByTestId('rm-inventory-missing').textContent).toContain('No inventory balance record found');
    expect(box.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    // item with a balance record: real reserved / available values are shown
    expect(box.getAllByText('100').length).toBeGreaterThan(0);
    expect(box.getAllByText('400').length).toBeGreaterThan(0);
    expect(box.getAllByText('500').length).toBeGreaterThan(0);
  });

  it('closes, then reopening a different receipt loads its own clean data (one request per open, no stale rows)', async () => {
    const rec2: any = {
      id: 'rec-2',
      receiptCode: 'RMR-00002',
      gatePassNo: 'GP-2002',
      receiptDate: '2026-09-15',
      status: 'CONFIRMED',
      division: { id: 'div-pwi', name: 'Pakistan Wire Industries', divisionCode: 'DIV-PWI' },
      section: { id: 'sec-pwi-1', name: 'PWI Store' },
      department: { id: 'dept-pwi-1', name: 'PWI Stores' },
      warehouse: { id: 'wh-2', name: 'SPI Warehouse' },
      lineCount: 1,
      gatePassTotal: 30,
      receivedTotal: 30,
      differenceTotal: 0,
      lines: [{
        id: 'line-2', lineNumber: 1,
        item: { id: 'item-pwi-1', name: 'Liquid China Soap', itemCode: '271023' },
        uom: { id: 'uom-kg', code: 'KG' },
        gatePassQuantity: 30, receivedQuantity: 30, difference: 0,
      }],
    };
    const invRec1: any = {
      ...baseInventory,
      items: [{
        lineNumber: 1,
        item: { id: 'item-ccd-1', itemCode: 'RM-WIRE-001', name: '1.20 mm-84 Wire' },
        uom: { id: 'uom-kg', code: 'KG' },
        receivedQuantity: 80, gatePassQuantity: 100.5,
        balance: { exists: true, onHand: 500, reserved: 100, available: 400, lastUpdatedAt: null },
      }],
    };
    const invRec2: any = {
      receiptCode: 'RMR-00002',
      receiptDate: '2026-09-15',
      status: 'CONFIRMED',
      warehouse: { id: 'wh-2', name: 'SPI Warehouse' },
      items: [{
        lineNumber: 1,
        item: { id: 'item-pwi-1', itemCode: '271023', name: 'Liquid China Soap' },
        uom: { id: 'uom-kg', code: 'KG' },
        receivedQuantity: 30, gatePassQuantity: 30,
        balance: { exists: true, onHand: 120, reserved: 0, available: 120, lastUpdatedAt: null },
      }],
    };
    const calls: string[] = [];
    apiMock.get.mockImplementation((url: string) => {
      calls.push(url as string);
      if (url === '/inventory/receipts/gate-pass/form-data') return Promise.resolve({ data: mockRefData } as any);
      if (url === '/inventory/receipts/gate-pass') return Promise.resolve({ data: [...mockReceipts, rec2], total: 2 } as any);
      if (url === '/inventory/receipts/gate-pass/rec-1') return Promise.resolve({ data: mockReceipts[0] } as any);
      if (url === '/inventory/receipts/gate-pass/rec-2') return Promise.resolve({ data: rec2 } as any);
      if (url === '/inventory/receipts/gate-pass/rec-1/inventory') return Promise.resolve({ data: invRec1 } as any);
      if (url === '/inventory/receipts/gate-pass/rec-2/inventory') return Promise.resolve({ data: invRec2 } as any);
      return Promise.resolve({ data: [] } as any);
    });

    renderHarness();
    await screen.findByText('RMR-00001');
    const openDetail = (code: string) => {
      const row = screen.getByText(code).closest('tr') as HTMLElement;
      fireEvent.click((row.querySelector('.anticon-eye') as HTMLElement).closest('button') as HTMLElement);
    };

    // open inventory for the first receipt
    openDetail('RMR-00001');
    await screen.findByTestId('rm-detail-wa');
    fireEvent.click(screen.getByTestId('rm-detail-inventory'));
    await screen.findByTestId('rm-inventory-receipt');
    expect(within(screen.getByTestId('rm-inventory-body')).getByTestId('rm-inventory-receipt').textContent).toBe('RMR-00001');
    expect(within(screen.getByTestId('rm-inventory-body')).getByText('RM-WIRE-001')).toBeInTheDocument();

    // close via the explicit X
    fireEvent.click(document.querySelector('.rmr-inventory-modal .ant-modal-close') as HTMLElement);
    await waitFor(() => expect(screen.queryByTestId('rm-inventory-body')).not.toBeInTheDocument());

    // reopen for a different receipt
    openDetail('RMR-00002');
    await waitFor(() => expect(screen.getByTestId('rm-detail-code').textContent).toBe('RMR-00002'));
    fireEvent.click(screen.getByTestId('rm-detail-inventory'));
    await waitFor(() => expect(within(screen.getByTestId('rm-inventory-body')).getByTestId('rm-inventory-receipt').textContent).toBe('RMR-00002'));

    const box = within(screen.getByTestId('rm-inventory-body'));
    expect(box.getByText('271023')).toBeInTheDocument();
    expect(box.getByText('SPI Warehouse')).toBeInTheDocument();
    // no stale row from the first receipt, and none duplicated
    expect(box.queryByText('RM-WIRE-001')).not.toBeInTheDocument();
    expect(box.getAllByText('271023').length).toBe(1);

    const invCalls = calls.filter((u) => u.endsWith('/inventory')).length;
    expect(invCalls).toBe(2); // exactly one per opening
  });

  it('keeps the inventory table horizontally scrollable inside the modal (no page overflow)', async () => {
    await openInventoryPopup({
      ...baseInventory,
      items: [{
        lineNumber: 1,
        item: { id: 'item-ccd-1', itemCode: 'RM-WIRE-001', name: '1.20 mm-84 Wire' },
        uom: { id: 'uom-kg', code: 'KG' },
        receivedQuantity: 80, gatePassQuantity: 100.5,
        balance: { exists: true, onHand: 500, reserved: 100, available: 400, lastUpdatedAt: null },
      }],
    });

    const content = inventoryBox().getAllByText('Current On Hand')[0].closest('.ant-table-content') as HTMLElement;
    expect(content).not.toBeNull();
    const overflow = String(content.style.overflowX || content.style.overflow || '');
    expect(overflow).toMatch(/auto|scroll/);
  });
});

describe('RawMaterialReceiving RMR-01-C-C — Inventory Impact Preview (New Receipt form)', () => {
  const BAL: Record<string, Record<string, { onHand?: number; exists?: boolean; uomCode?: string }>> = {
    'wh-1': {
      'item-ccd-1': { onHand: 9940 },
      'item-ccd-2': { onHand: 3371.2 },
    },
    'wh-2': { 'item-ccd-1': { onHand: 200 } },
  };

  const previewResponse = (params: Record<string, unknown>, warehouse: string) => {
    const itemIds = String(params.itemIds).split(',');
    const map = BAL[warehouse] || {};
    return {
      data: {
        companyId: 'comp-1',
        warehouseId: warehouse,
        items: itemIds.map((id) => {
          const m = map[id] || { exists: false, onHand: null };
          return {
            itemId: id,
            itemCode: (mockRefData.items as any).find((i: any) => i.id === id)?.itemCode ?? 'X',
            itemName: (mockRefData.items as any).find((i: any) => i.id === id)?.name ?? null,
            uomCode: m.uomCode ?? 'KG',
            exists: m.exists ?? true,
            onHand: m.exists === false ? null : (m.onHand ?? 0),
            reserved: 0,
            available: m.exists === false ? null : (m.onHand ?? 0),
            lastUpdatedAt: '2026-09-16T10:00:00Z',
          };
        }),
      },
    } as any;
  };

  const gatePassCard = () =>
    screen.getByText(/Gate Pass Items/).closest('.ant-card') as HTMLElement;

  const qtyInputs = () =>
    within(gatePassCard()).getAllByPlaceholderText('0.00') as HTMLInputElement[];

  const summaryGroup = (itemId: string) =>
    within(screen.getByTestId(`rm-inv-summary-${itemId}`));

  const rowCell = (itemId: string) =>
    document.querySelector<HTMLElement>(`[data-testid="rm-preview-${itemId}"]`);

  const openWithDraft = async (opts: {
    rows: RmDraftLine[];
    values?: Record<string, unknown>;
    refData?: any;
    editingId?: string | null;
    previewImpl?: (url: string, params: Record<string, unknown>) => Promise<{ data: any }> | Promise<never>;
    extraRoutes?: (url: string, params?: Record<string, unknown>) => Promise<{ data: any }> | Promise<never>;
  }) => {
    useRawReceiptDraftStore.setState({
      minimized: false,
      pendingRestore: false,
      draft: {
        editingId: opts.editingId ?? null,
        values: { divisionId: 'div-ccd', ...(opts.values || {}) },
        rows: opts.rows,
      },
    });
    const previewCalls: Array<{ url: string; params: Record<string, unknown> }> = [];
    const impl = opts.previewImpl || ((_u, params) => Promise.resolve(previewResponse(params, String(params.warehouseId || 'wh-1'))));
    apiMock.get.mockImplementation((url: string, params?: Record<string, unknown>) => {
      if (url === '/inventory/receipts/gate-pass/form-data') {
        return Promise.resolve({ data: opts.refData || mockRefData } as any);
      }
      if (url === '/inventory/receipts/gate-pass') {
        return Promise.resolve({ data: mockReceipts, total: 1 } as any);
      }
      if (url === '/inventory/receipts/gate-pass/rec-1') {
        return Promise.resolve({ data: mockReceipts[0] } as any);
      }
      if (url === '/inventory/balances/preview') {
        previewCalls.push({ url, params: params || {} });
        return impl(url, params || {});
      }
      if (opts.extraRoutes) return opts.extraRoutes(url, params);
      return Promise.resolve({ data: [] } as any);
    });
    renderHarness();
    await screen.findByText('RMR-00001');
    await screen.findByText('LIVE VERIFICATION (2027)');
    return previewCalls;
  };

  const awaitCellText = (itemId: string, label: string, re: RegExp) =>
    pollUntil(() => {
      const el = rowCell(itemId);
      return !!el && re.test(el.textContent || '');
    }, `${label} (rm-preview-${itemId})`);

  const awaitCalls = (arr: unknown[], n: number, label: string) =>
    pollUntil(() => arr.length >= n, `${label} (got ${arr.length}/${n})`);

  it('1. loads live balances for every selected item in ONE bulk request (no N+1)', async () => {
    const calls = await openWithDraft({
      rows: [
        { key: 'k1', itemId: 'item-ccd-1', uomId: 'uom-kg' },
        { key: 'k2', itemId: 'item-ccd-2', uomId: 'uom-kg' },
      ],
    });

    await awaitCellText('item-ccd-1', 'current ccd-1', /9,940/);
    await awaitCellText('item-ccd-2', 'current ccd-2', /3,371\.2/);

    expect(within(gatePassCard()).getAllByText('Current Inventory / After').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('rm-inv-preview-summary')).toBeInTheDocument();
    expect(screen.getByText(/INVENTORY IMPACT PREVIEW/)).toBeInTheDocument();
    expect(calls.length).toBe(1);
    expect(calls[0].params.warehouseId).toBe('wh-1');
    expect(String(calls[0].params.itemIds).split(',')).toEqual(expect.arrayContaining(['item-ccd-1', 'item-ccd-2']));
  });

  it('2. typing Received Qty updates Balance After live with NO extra requests', async () => {
    const calls = await openWithDraft({
      rows: [{ key: 'k1', itemId: 'item-ccd-1', uomId: 'uom-kg' }],
    });
    await awaitCellText('item-ccd-1', 'initial current', /9,940/);

    const [gatePassInput, receivedInput] = qtyInputs();
    fireEvent.change(gatePassInput, { target: { value: '3449' } });
    fireEvent.change(receivedInput, { target: { value: '3371.2' } });

    await awaitCellText('item-ccd-1', 'after 3371.2 received', /13,311\.2/);
    expect(calls.length).toBe(1);
    expect(gatePassCard().textContent).toMatch(/3,371\.2/);
  });

  it('3. Gate Pass quantity is NOT added to inventory (movement = received only)', async () => {
    const calls = await openWithDraft({
      rows: [{ key: 'k1', itemId: 'item-ccd-1', uomId: 'uom-kg' }],
    });
    await awaitCellText('item-ccd-1', 'current loaded', /9,940/);

    const [gatePassInput, receivedInput] = qtyInputs();
    fireEvent.change(gatePassInput, { target: { value: '3449' } });
    fireEvent.change(receivedInput, { target: { value: '3371.2' } });

    await awaitCellText('item-ccd-1', 'after = received', /13,311\.2/);
    // 9,940 + 3,449 (gate pass) = 13,389 — must NOT appear anywhere.
    expect(document.body.textContent).not.toMatch(/13,389/);
    const g = summaryGroup('item-ccd-1');
    expect(g.getByText('This Receipt')).toBeInTheDocument();
    expect(g.getByText(/3,371\.2/)).toBeInTheDocument();
    expect(g.queryByText(/3,449/)).toBeNull();
    expect(calls.length).toBe(1);
  });

  it('4. Difference column unchanged with the preview present', async () => {
    await openWithDraft({
      rows: [{ key: 'k1', itemId: 'item-ccd-1', uomId: 'uom-kg' }],
    });
    await awaitCellText('item-ccd-1', 'current loaded', /9,940/);

    const [gatePassInput, receivedInput] = qtyInputs();
    fireEvent.change(gatePassInput, { target: { value: '3449' } });
    fireEvent.change(receivedInput, { target: { value: '3371.2' } });

    await pollUntil(() => gatePassCard().textContent?.includes('77.8') ?? false, 'difference 77.8');
    expect(within(gatePassCard()).getAllByText(/77\.8/).length).toBeGreaterThanOrEqual(1);
  });

  it('5. zero on-hand renders a real 0 (not an error)', async () => {
    await openWithDraft({
      rows: [{ key: 'k1', itemId: 'item-ccd-1', uomId: 'uom-kg' }],
      previewImpl: (_u, params) =>
        Promise.resolve(previewResponse({ ...params }, 'zero')),
    });
    await awaitCellText('item-ccd-1', 'zero current', /^.*0.*$/);
    expect(rowCell('item-ccd-1')?.textContent).toMatch(/0/);
    expect(screen.queryByText('Unable to load current inventory.')).toBeNull();
  });

  it('6. missing balance record shows 0 + hint, never a fake number', async () => {
    await openWithDraft({
      rows: [{ key: 'k1', itemId: 'item-ccd-1', uomId: 'uom-kg' }],
      previewImpl: (_u, params) => {
        return Promise.resolve({
          data: {
            companyId: 'comp-1',
            warehouseId: params.warehouseId,
            items: [{
              itemId: 'item-ccd-1', itemCode: 'RM-WIRE-001', itemName: '1.20 mm-84 Wire',
              uomCode: 'KG', exists: false, onHand: null, reserved: null, available: null,
              lastUpdatedAt: null,
            }],
          },
        } as any);
      },
    });

    await pollUntil(() => !!rowCell('item-ccd-1')?.querySelector('[data-testid="rm-preview-missing"]'), 'missing hint in row');
    await pollUntil(() => !!screen.queryByTestId('rm-inv-summary-missing'), 'missing hint in summary');
    expect(screen.getAllByText('No existing balance record — current treated as 0').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Unable to load current inventory.')).toBeNull();
  });

  it('7. API error shows explicit message + Retry, and Retry recovers', async () => {
    let fail = true;
    const calls = await openWithDraft({
      rows: [{ key: 'k1', itemId: 'item-ccd-1', uomId: 'uom-kg' }],
      previewImpl: async (_u, params) => {
        if (fail) { fail = false; throw new Error('boom'); }
        return previewResponse(params, 'wh-1');
      },
    });

    await pollUntil(() => !!rowCell('item-ccd-1')?.querySelector('[data-testid="rm-preview-error"]'), 'row error');
    await pollUntil(() => !!screen.queryByTestId('rm-inv-summary-error'), 'summary error');
    expect(screen.getAllByText('Unable to load current inventory.').length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByTestId('rm-preview-retry-item-ccd-1'));
    await awaitCellText('item-ccd-1', 'recovered current', /9,940/);
    expect(calls.length).toBe(2);
    expect(screen.queryByTestId('rm-inv-summary-error')).toBeNull();
  });

  it('8. multi-item summary groups each item separately with NO combined total', async () => {
    await openWithDraft({
      rows: [
        { key: 'k1', itemId: 'item-ccd-1', uomId: 'uom-kg' },
        { key: 'k2', itemId: 'item-ccd-2', uomId: 'uom-kg' },
      ],
    });

    await awaitCellText('item-ccd-1', 'ccd-1 current', /9,940/);
    await awaitCellText('item-ccd-2', 'ccd-2 current', /3,371\.2/);

    // Exactly two independent groups — no third aggregated row for a grand total.
    const groups = screen.getAllByTestId(/rm-inv-summary-item-.+/);
    expect(groups.length).toBe(2);
    expect(screen.queryByText(/13,311\.2/)).toBeNull();
    expect(summaryGroup('item-ccd-1').getAllByText(/9,940/).length).toBeGreaterThanOrEqual(1);
    expect(summaryGroup('item-ccd-2').getAllByText(/3,371\.2/).length).toBeGreaterThanOrEqual(1);
  });

  it('9. UOMs are kept separate — different units are never summed', async () => {
    const ref = {
      ...mockRefData,
      uoms: [
        { id: 'uom-kg', code: 'KG', name: 'Kilograms', symbol: 'kg', status: 'ACTIVE' },
        { id: 'uom-pcs', code: 'PCS', name: 'Pieces', symbol: 'pcs', status: 'ACTIVE' },
      ],
    };
    await openWithDraft({
      rows: [
        { key: 'k1', itemId: 'item-ccd-1', uomId: 'uom-kg' },
        { key: 'k2', itemId: 'item-ccd-2', uomId: 'uom-pcs' },
      ],
      refData: ref,
      previewImpl: (_u, params) => {
        const ids = String(params.itemIds).split(',');
        return Promise.resolve({
          data: {
            companyId: 'comp-1', warehouseId: params.warehouseId,
            items: ids.map((id) => ({
              itemId: id,
              itemCode: id === 'item-ccd-1' ? 'RM-WIRE-001' : 'RM-WIRE-002',
              itemName: null,
              uomCode: id === 'item-ccd-1' ? 'KG' : 'PCS',
              exists: true, onHand: 10, reserved: 0, available: 10, lastUpdatedAt: null,
            })),
          },
        } as any);
      },
    });

    await pollUntil(() => screen.getAllByTestId(/rm-inv-summary-item-.+/).length === 2, 'two groups');
    expect(summaryGroup('item-ccd-1').getAllByText(/KG/).length).toBeGreaterThanOrEqual(1);
    expect(summaryGroup('item-ccd-2').getAllByText(/PCS/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/UOMs are kept separate — different units are never summed\./)).toBeInTheDocument();
  });

  it('10. changing the receiving warehouse refetches balances (no stale values)', async () => {
    const ref = {
      ...mockRefData,
      warehouses: [
        { id: 'wh-1', name: 'Main Raw Material Warehouse', warehouseCode: 'WH-RM-01', status: 'ACTIVE' },
        { id: 'wh-2', name: 'Spare Warehouse', warehouseCode: 'WH-RM-02', status: 'ACTIVE' },
      ],
    };
    const calls = await openWithDraft({
      rows: [{ key: 'k1', itemId: 'item-ccd-1', uomId: 'uom-kg' }],
      values: { warehouseId: 'wh-1' },
      refData: ref,
    });

    await awaitCellText('item-ccd-1', 'wh-1 current', /9,940/);
    expect(calls.length).toBe(1);

    openDropdown('warehouseId');
    await pickOption('WH-RM-02 — Spare Warehouse');

    await awaitCellText('item-ccd-1', 'wh-2 current', /200/);
    expect(calls.length).toBe(2);
    expect(calls[1].params.warehouseId).toBe('wh-2');
    expect(rowCell('item-ccd-1')?.textContent).not.toMatch(/9940/);
  });

  it('11. changing an item on a line refetches balances for the new item only', async () => {
    const calls = await openWithDraft({
      rows: [{ key: 'k1', itemId: 'item-ccd-1', uomId: 'uom-kg' }],
    });
    await awaitCellText('item-ccd-1', 'ccd-1 current', /9,940/);
    expect(calls.length).toBe(1);

    const row = gatePassCard().querySelectorAll('tr.ant-table-row')[0];
    const itemSelect = row!.querySelectorAll('.ant-select')[0];
    fireEvent.mouseDown(itemSelect!.querySelector('.ant-select-selector') as HTMLElement);
    await pickOption('RM-WIRE-002 — 1.40 mm-84 Wire');

    await awaitCellText('item-ccd-2', 'ccd-2 current', /3,371\.2/);
    expect(calls.length).toBe(2);
    expect(String(calls[1].params.itemIds)).toBe('item-ccd-2');
    expect(String(calls[1].params.itemIds)).not.toContain('item-ccd-1');
  });

  it('12. preview performs ZERO mutation calls while typing and switching items', async () => {
    const calls = await openWithDraft({
      rows: [{ key: 'k1', itemId: 'item-ccd-1', uomId: 'uom-kg' }],
    });
    await awaitCellText('item-ccd-1', 'current loaded', /9,940/);

    const [gatePassInput, receivedInput] = qtyInputs();
    fireEvent.change(gatePassInput, { target: { value: '3449' } });
    fireEvent.change(receivedInput, { target: { value: '3371.2' } });
    await awaitCellText('item-ccd-1', 'after update', /13,311\.2/);

    const row = gatePassCard().querySelectorAll('tr.ant-table-row')[0];
    fireEvent.mouseDown(row!.querySelectorAll('.ant-select')[0].querySelector('.ant-select-selector') as HTMLElement);
    await pickOption('RM-WIRE-002 — 1.40 mm-84 Wire');
    await awaitCellText('item-ccd-2', 'switched item', /3,371\.2/);

    expect(calls.length).toBe(2);
    expect(apiMock.post).not.toHaveBeenCalled();
    expect(apiMock.patch).not.toHaveBeenCalled();
    expect(apiMock.put).not.toHaveBeenCalled();
    expect(apiMock.delete).not.toHaveBeenCalled();
  });

  it('13. fully open form still sends no preview request until an item + warehouse exist', async () => {
    const calls = await openWithDraft({ rows: [{ key: 'k1' }] });
    expect(screen.getByText(/Select raw materials and a receiving warehouse to preview the real inventory impact\./)).toBeInTheDocument();
    expect(calls.length).toBe(0);
    expect(within(gatePassCard()).getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it('14. editing an existing receipt does NOT double-count stock (prior posted deducted)', async () => {
    const previewCalls: Array<{ url: string; params: Record<string, unknown> }> = [];
    apiMock.get.mockImplementation((url: string, params?: Record<string, unknown>) => {
      if (url === '/inventory/receipts/gate-pass/form-data') return Promise.resolve({ data: mockRefData } as any);
      if (url === '/inventory/receipts/gate-pass') return Promise.resolve({ data: mockReceipts, total: 1 } as any);
      if (url === '/inventory/receipts/gate-pass/rec-1') return Promise.resolve({ data: mockReceipts[0] } as any);
      if (url === '/inventory/balances/preview') {
        previewCalls.push({ url, params: params || {} });
        return Promise.resolve(previewResponse(params || {}, 'wh-1'));
      }
      return Promise.resolve({ data: [] } as any);
    });
    const tableRowText = (itemId: string, re: RegExp) => {
      const el = rowCell(itemId);
      return !!el && re.test(el.textContent || '');
    };
    const awaitFlush = async (label: string, fn: () => boolean, n = 80) => {
      for (let i = 0; i < n; i += 1) {
        if (fn()) return;
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      }
      throw new Error(`awaitFlush timed out: ${label}`);
    };
    renderHarness();
    await screen.findByText('RMR-00001');

    // Open the edit form directly from the table row (no create modal first).
    const row = screen.getByText('RMR-00001').closest('tr') as HTMLElement;
    fireEvent.click((row.querySelector('.anticon-edit') as HTMLElement).closest('button') as HTMLElement);

    await awaitFlush('edit modal open', () => !!screen.queryByText('LIVE VERIFICATION (2027)'));
    await awaitFlush('edit current loaded', () => tableRowText('item-ccd-1', /9,940/));
    await awaitFlush('prior note', () => !!screen.queryByTestId('rm-inv-summary-prior'));
    expect(screen.getAllByText(/Prior posted 100\.5 KG/).length).toBeGreaterThanOrEqual(1);
    // received 100.5 − prior 100.5 ⇒ after stays 9,940 (no double count)
    expect(summaryGroup('item-ccd-1').getAllByText(/9,940/).length).toBeGreaterThanOrEqual(1);

    const receivedInput = qtyInputs()[1];
    fireEvent.change(receivedInput, { target: { value: '120' } });
    await awaitFlush('after 120', () => tableRowText('item-ccd-1', /9,959\.5/));
    expect(previewCalls.length).toBe(1); // no refetch while editing quantities
    expect(apiMock.post).not.toHaveBeenCalled();
    expect(apiMock.patch).not.toHaveBeenCalled();
    expect(apiMock.put).not.toHaveBeenCalled();
    expect(apiMock.delete).not.toHaveBeenCalled();
  });

  it('15. same item across multiple lines is summed into ONE summary group', async () => {
    await openWithDraft({
      rows: [
        { key: 'k1', itemId: 'item-ccd-1', uomId: 'uom-kg', receivedQuantity: 120 },
        { key: 'k2', itemId: 'item-ccd-1', uomId: 'uom-kg', receivedQuantity: 130 },
      ],
    });
    await awaitCellText('item-ccd-1', 'current loaded', /9,940/);

    const groups = screen.getAllByTestId(/rm-inv-summary-item-.+/);
    expect(groups.length).toBe(1);
    await pollUntil(() => summaryGroup('item-ccd-1').getByText(/9,940/).getAttribute('class') !== null, 'summary rendering');
    // 9,940 + 120 + 130 = 10,190
    await pollUntil(() => !!screen.queryByText(/10,190/), 'combined after');
    expect(summaryGroup('item-ccd-1').getByText(/250/).parentElement).toBeInTheDocument();
  });
});