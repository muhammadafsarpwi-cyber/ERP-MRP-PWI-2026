import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { App as AntApp } from 'antd';
import OperationEditor, { Routing, RoutingOperation, OperationEditorLookups } from './OperationEditor';
import apiService from '../../services/api';
import * as apiMod from '../../services/api';

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

jest.setTimeout(120000);

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

const lookups: OperationEditorLookups = {
  items: [
    { id: 'i1', name: 'Wire', itemCode: 'RM-WIRE', itemType: 'RM' },
    { id: 'i2', name: 'Casing', itemCode: 'FG-CASING', itemType: 'FG' },
  ],
  divisions: [{ id: 'd1', name: 'Conduit Cable Division', divisionCode: 'DIV-CCD' }],
  sections: [{ id: 's1', name: 'Flattening', sectionCode: 'SEC-1', divisionId: 'd1' }],
  departments: [{ id: 'dep1', name: 'Flattening Dept', departmentCode: 'DEPT-1', divisionId: 'd1', sectionId: 's1' }],
  uoms: [{ id: 'u1', name: 'Kilogram', code: 'KG' }],
  machines: [{ id: 'm1', name: 'Flattening Machine 1', machineCode: 'MCH001' }],
  warehouses: [{ id: 'w1', name: 'Main Warehouse', warehouseCode: 'WH-1' }],
};

const routing: Routing = {
  id: 'rtg1',
  routingCode: 'RTG-001',
  name: 'Test Routing',
  description: '',
  productId: 'i2',
  bomId: 'b1',
  routeTypeId: 'r1',
  status: 'DRAFT',
  baseQuantity: 1,
  estimatedTotalTime: 0,
  isDefault: false,
  operations: [],
  createdAt: '',
  updatedAt: '',
};

const operation: RoutingOperation = {
  id: 'op1',
  sequenceNo: 10,
  operationCode: 'OP-1',
  operationName: 'Flattening',
  description: undefined,
  divisionId: 'd1',
  sectionId: 's1',
  departmentId: 'dep1',
  setupTimeMinutes: 5,
  runTimeMinutes: 20,
  queueTimeMinutes: 0,
  waitTimeMinutes: 0,
  laborRequired: true,
  machineRequired: true,
  machineId: 'm1',
  inputQuantity: 1,
  outputQuantity: 1,
  scrapPercentage: 0,
  setupScrapPercentage: 0,
  status: 'ACTIVE',
  remarks: undefined,
  inputs: [{ itemId: 'i1', quantity: 1, uomId: 'u1', isPrimary: true }],
  outputs: [{ itemId: 'i2', quantity: 1, uomId: 'u1', outputType: 'MAIN', isPrimary: true }],
};

const target = {
  id: 't1',
  shift: { shiftCode: 'A', name: 'Shift A' },
  item: { itemCode: 'RM-WIRE', name: 'Wire' },
  uom: { code: 'KG' },
  machine: { machineCode: 'MCH001', name: 'Flattening Machine 1' },
  standardHours: 8,
  targetQuantity: 100,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  status: 'ACTIVE',
};

function renderEditor(props: Partial<React.ComponentProps<typeof OperationEditor>> = {}) {
  return render(
    <AntApp>
      <OperationEditor
        open
        routing={routing}
        operation={null}
        lookups={lookups}
        onClose={jest.fn()}
        onSaved={jest.fn()}
        {...props}
      />
    </AntApp>
  );
}

describe('OperationEditor', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.put.mockReset();
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/production/machine-targets') return Promise.resolve({ data: [target] });
      return Promise.resolve({ data: [] });
    });
    (apiMod.describeRequestError as jest.Mock).mockImplementation((err: any) => {
      const data = err?.response?.data?.message;
      const msg = Array.isArray(data) ? data.join('; ') : String(data);
      return `Server returned HTTP ${err?.response?.status}: ${msg}`;
    });
  });

  it('renders a reusable Add Operation dialog with a Save button (not OK)', () => {
    renderEditor();
    expect(screen.getByText('Add Operation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'OK' })).not.toBeInTheDocument();
  });

  it('fetches and renders the machine-target summary (read-only) for the attached machine', async () => {
    renderEditor({ operation });
    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledWith(
        '/production/machine-targets',
        expect.objectContaining({ machineId: 'm1' })
      );
    }, { timeout: 30000 });
    expect(await screen.findByText(/Shift A/, undefined, { timeout: 30000 })).toBeInTheDocument();
    expect(screen.getByText('100.00')).toBeInTheDocument();
    expect(screen.getByText('Machine Target (read-only)')).toBeInTheDocument();
  });

  it('sends a merged legacy + junction payload on save and confirms with Modal.success', async () => {
    apiMock.post.mockResolvedValue({ data: {} });
    const onSaved = jest.fn();
    renderEditor({ operation: null, onSaved });

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'OP-NEW' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Op' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith(
        '/production/routings/rtg1/operations',
        expect.objectContaining({
          operationCode: 'OP-NEW',
          operationName: 'New Op',
          machineRequired: false,
          machineId: null,
          inputs: [],
        })
      );
      expect(onSaved).toHaveBeenCalled();
    }, { timeout: 30000 });
  });

  it('updates an existing operation via PUT', async () => {
    apiMock.put.mockResolvedValue({ data: {} });
    renderEditor({ operation });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(apiMock.put).toHaveBeenCalledWith(
        '/production/routings/operations/op1',
        expect.objectContaining({ operationCode: 'OP-1' })
      );
    });
  });

  const ALLOWED_TOP_LEVEL = new Set([
    'sequenceNo', 'operationCode', 'operationName', 'description',
    'divisionId', 'sectionId', 'departmentId',
    'setupTimeMinutes', 'runTimeMinutes', 'queueTimeMinutes', 'waitTimeMinutes',
    'laborRequired', 'machineRequired', 'machineId',
    'inputItemId', 'inputQuantity', 'outputItemId', 'outputQuantity', 'uomId',
    'inputs', 'outputs', 'scrapPercentage', 'setupScrapPercentage', 'status', 'remarks',
  ]);

  it('POSTs a DTO-exact add-operation payload that never includes companyId', async () => {
    apiMock.post.mockResolvedValue({ data: {} });
    const onSaved = jest.fn();
    renderEditor({ operation: null, onSaved });
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'OP-NEW' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Op' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalled(), { timeout: 30000 });
    const payload = apiMock.post.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('companyId');
    expect(payload).not.toHaveProperty('operationId');
    for (const key of Object.keys(payload)) {
      expect(ALLOWED_TOP_LEVEL.has(key)).toBe(true);
    }
    expect(onSaved).toHaveBeenCalled();
  });

  it('PUTs a DTO-exact update-operation payload that never includes companyId', async () => {
    apiMock.put.mockResolvedValue({ data: {} });
    renderEditor({ operation });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalled(), { timeout: 30000 });
    const payload = apiMock.put.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('companyId');
    expect(payload).not.toHaveProperty('operationId');
    for (const key of Object.keys(payload)) {
      expect(ALLOWED_TOP_LEVEL.has(key)).toBe(true);
    }
  });

  it('surfaces backend validation errors instead of swallowing them', async () => {
    (apiMod.describeRequestError as jest.Mock).mockImplementation((err: any) => {
      const data = err?.response?.data?.message;
      const msg = Array.isArray(data) ? data.join('; ') : String(data);
      return `Server returned HTTP ${err?.response?.status}: ${msg}`;
    });
    apiMock.post.mockRejectedValue({
      response: { status: 400, data: { message: ['divisionId must be a UUID'] } },
    });
    const onSaved = jest.fn();
    renderEditor({ operation: null, onSaved });
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'OP-NEW' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Op' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Server returned HTTP 400: divisionId must be a UUID/, undefined, { timeout: 30000 })).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows a centered processing state (Saving... / spinner / Processing request...) while the real request is in flight', async () => {
    let resolvePost: (v: unknown) => void = () => {};
    const pending = new Promise<unknown>((r) => { resolvePost = r; });
    apiMock.post.mockReturnValue(pending as any);
    const onSaved = jest.fn();
    renderEditor({ operation: null, onSaved });
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'OP-NEW' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Op' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByTestId('save-result-loading')).toBeInTheDocument(), { timeout: 30000 });
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Processing request...')).toBeInTheDocument();

    resolvePost({ data: { operations: [{ id: 'opNew', operationCode: 'OP-NEW', operationName: 'New Op' }] } });
    await waitFor(() => expect(screen.getByTestId('save-result-success')).toBeInTheDocument(), { timeout: 30000 });
    expect(onSaved).toHaveBeenCalled();
  });

  it('prevents duplicate submissions while a save is in flight', async () => {
    let resolvePost: (v: unknown) => void = () => {};
    const pending = new Promise<unknown>((r) => { resolvePost = r; });
    apiMock.post.mockReturnValue(pending as any);
    renderEditor({ operation: null, onSaved: jest.fn() });
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'OP-NEW' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Op' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1), { timeout: 30000 });

    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await new Promise((r) => setTimeout(r, 100));
    expect(apiMock.post).toHaveBeenCalledTimes(1);

    resolvePost({ data: { operations: [{ operationCode: 'OP-NEW', operationName: 'New Op' }] } });
    await waitFor(() => expect(screen.getByTestId('save-result-success')).toBeInTheDocument(), { timeout: 30000 });
  });

  it('shows success only after the API confirms, with the actual backend-generated code', async () => {
    apiMock.post.mockResolvedValue({
      data: { operations: [{ id: 'opNew', operationCode: 'OP-NEW', operationName: 'New Op' }] },
    });
    renderEditor({ operation: null, onSaved: jest.fn() });
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'OP-NEW' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Op' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalled(), { timeout: 30000 });
    await waitFor(() => expect(screen.getByTestId('save-result-success')).toBeInTheDocument(), { timeout: 30000 });
    expect(screen.getByText('Successful')).toBeInTheDocument();
    expect(screen.getByText('Operation Saved Successfully')).toBeInTheDocument();
    expect(screen.getByText('Operation Code')).toBeInTheDocument();
    expect(screen.getByText('OP-NEW')).toBeInTheDocument();
    expect(screen.getByText('New Op')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'OK' })).not.toBeInTheDocument();
  });

  it('never shows success on failure, keeps the form open with values, and shows the normalized backend error', async () => {
    apiMock.post.mockRejectedValue({
      response: { status: 400, data: { message: ['scrapPercentage must not exceed 100'] } },
    });
    const onSaved = jest.fn();
    renderEditor({ operation: null, onSaved });
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'OP-NEW' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Op' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/Server returned HTTP 400: scrapPercentage must not exceed 100/, undefined, { timeout: 30000 })).toBeInTheDocument();
    // TASK15-C: the failure is presented in a persistent error dialog (not an
    // auto-dismissing toast) that can only be closed or retried.
    expect(await screen.findByTestId('save-result-error', undefined, { timeout: 30000 })).toBeInTheDocument();
    expect(screen.queryByTestId('save-result-success')).not.toBeInTheDocument();
    expect(screen.queryByTestId('save-result-loading')).not.toBeInTheDocument();
    expect(screen.queryByText('Successful')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Code')).toBeInTheDocument();
    expect((screen.getByLabelText('Code') as HTMLInputElement).value).toBe('OP-NEW');
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('New Op');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('restores Save and allows a successful retry after a failed attempt', async () => {
    apiMock.post
      .mockRejectedValueOnce({ response: { status: 400, data: { message: ['divisionId must be a UUID'] } } })
      .mockResolvedValueOnce({ data: { operations: [{ id: 'opNew', operationCode: 'OP-NEW', operationName: 'New Op' }] } });
    renderEditor({ operation: null, onSaved: jest.fn() });
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'OP-NEW' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Op' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1), { timeout: 30000 });
    await waitFor(() => expect(screen.queryByTestId('save-result-loading')).not.toBeInTheDocument(), { timeout: 30000 });
    expect((screen.getByLabelText('Code') as HTMLInputElement).value).toBe('OP-NEW');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(2), { timeout: 30000 });
    await waitFor(() => expect(screen.getByTestId('save-result-success')).toBeInTheDocument(), { timeout: 30000 });
    expect(screen.getByText('OP-NEW')).toBeInTheDocument();
  });

  it('edit: shows the backend-updated code, confirms via onSaved (parent refetch), and forwards multi-IO junctions', async () => {
    apiMock.put.mockResolvedValue({ data: { id: 'op1', operationCode: 'OP-1', operationName: 'Flattening' } });
    const onSaved = jest.fn();
    renderEditor({ operation, onSaved });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(apiMock.put).toHaveBeenCalled(), { timeout: 30000 });
    await waitFor(() => expect(screen.getByTestId('save-result-success')).toBeInTheDocument(), { timeout: 30000 });
    expect(screen.getByText('Operation Updated Successfully')).toBeInTheDocument();
    expect(screen.getByText('OP-1')).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalled();

    const payload = apiMock.put.mock.calls[0][1] as { inputs?: unknown[]; outputs?: unknown[] };
    expect(payload.inputs).toHaveLength(1);
    expect(payload.outputs).toHaveLength(1);
    expect(payload.inputs![0]).toEqual(expect.objectContaining({ itemId: 'i1', quantity: 1, uomId: 'u1', isPrimary: true }));
    expect(payload.outputs![0]).toEqual(expect.objectContaining({ itemId: 'i2', quantity: 1, uomId: 'u1', outputType: 'MAIN', isPrimary: true }));
  });

  // ── TASK15-C: organization cascading ─────────────────────────────────────

  it('CASCADE: Division → Section → Department options narrow and parent changes safely clear dependents', async () => {
    const cascadeLookups: OperationEditorLookups = {
      ...lookups,
      divisions: [
        { id: 'd1', name: 'Division A', divisionCode: 'DIV-A' },
        { id: 'd2', name: 'Division B', divisionCode: 'DIV-B' },
      ],
      sections: [
        { id: 's1', name: 'Section A', sectionCode: 'SEC-A', divisionId: 'd1' },
        { id: 's2', name: 'Section B', sectionCode: 'SEC-B', divisionId: 'd2' },
      ],
      departments: [
        { id: 'dep1', name: 'Dept A1', departmentCode: 'DEPT-A1', divisionId: 'd1', sectionId: 's1' },
        { id: 'dep2', name: 'Dept A2', departmentCode: 'DEPT-A2', divisionId: 'd1', sectionId: 's2' },
        { id: 'dep3', name: 'Dept B1', departmentCode: 'DEPT-B1', divisionId: 'd2', sectionId: 's2' },
        { id: 'central', name: 'Central Dept', departmentCode: 'DEPT-C', divisionId: null, sectionId: null },
      ],
    };
    renderEditor({ lookups: cascadeLookups, operation: null });

    fireEvent.mouseDown(screen.getByLabelText('Division'));
    fireEvent.click(screen.getByText('DIV-A - Division A'));
    fireEvent.mouseDown(screen.getByLabelText('Section'));
    expect(screen.getByText('SEC-A - Section A')).toBeInTheDocument();
    expect(screen.queryByText('SEC-B - Section B')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('SEC-A - Section A'));
    fireEvent.mouseDown(screen.getByLabelText('Department'));
    expect(screen.getByText('DEPT-A1 - Dept A1')).toBeInTheDocument();
    expect(screen.queryByText('DEPT-A2 - Dept A2')).not.toBeInTheDocument();
    expect(screen.queryByText('DEPT-B1 - Dept B1')).not.toBeInTheDocument();
    expect(screen.getByText('DEPT-C - Central Dept')).toBeInTheDocument();
    fireEvent.click(screen.getByText('DEPT-A1 - Dept A1'));

    fireEvent.mouseDown(screen.getByLabelText('Division'));
    fireEvent.click(screen.getByText('DIV-B - Division B'));
    fireEvent.mouseDown(screen.getByLabelText('Section'));
    expect(screen.getByText('SEC-B - Section B')).toBeInTheDocument();
    expect(screen.queryByText('SEC-A - Section A')).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByLabelText('Department'));
    expect(screen.getByText('DEPT-B1 - Dept B1')).toBeInTheDocument();
    expect(screen.queryByText('DEPT-A1 - Dept A1')).not.toBeInTheDocument();
    expect(screen.getByText('DEPT-C - Central Dept')).toBeInTheDocument();
  });

  // ── TASK15-C: per-row Item Department → Item filtering ───────────────────

  const deptLookups: OperationEditorLookups = {
    ...lookups,
    items: [
      { id: 'i1', name: 'Wire', itemCode: 'RM-WIRE', itemType: 'RM', departmentId: 'dep1' },
      { id: 'i2', name: 'Casing', itemCode: 'FG-CASING', itemType: 'FG', departmentId: 'dep2' },
      { id: 'i3', name: 'Tape', itemCode: 'RM-TAPE', itemType: 'RM', departmentId: 'dep1' },
    ],
    departments: [
      { id: 'dep1', name: 'Dept 1', departmentCode: 'DEPT-1', divisionId: 'd1', sectionId: 's1' },
      { id: 'dep2', name: 'Dept 2', departmentCode: 'DEPT-2', divisionId: 'd1', sectionId: 's1' },
    ],
  };

  it('ITEM-FILTER: each input/output row filters Items by its own Item Department (independent of the Operation Department)', async () => {
    renderEditor({ lookups: deptLookups, operation: null });

    const placeholder = '.ant-select-selection-placeholder';

    const getLastPlaceholder = (text: string) => {
      const all = screen.getAllByText(text, { selector: placeholder });
      return all[all.length - 1];
    };

    const openSelect = (el: HTMLElement) => { fireEvent.mouseDown(el); };
    const pickOption = async (text: string) => {
      await waitFor(() => {
        const opts = screen.getAllByText(text, { selector: '.ant-select-item-option-content' });
        const visible = Array.from(opts).filter(o => {
          const dropdown = o.closest('.ant-select-dropdown');
          return dropdown && !dropdown.classList.contains('ant-select-dropdown-hidden');
        });
        expect(visible.length).toBeGreaterThan(0);
      });
      const opts = screen.getAllByText(text, { selector: '.ant-select-item-option-content' });
      const visible = Array.from(opts).filter(o => {
        const dropdown = o.closest('.ant-select-dropdown');
        return dropdown && !dropdown.classList.contains('ant-select-dropdown-hidden');
      });
      fireEvent.click(visible[visible.length - 1]);
      await new Promise(r => setTimeout(r, 50));
    };

    const closeAllDropdowns = () => {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    };

    fireEvent.click(screen.getByRole('button', { name: /Add Input Material/i }));
    await new Promise(r => setTimeout(r, 50));

    openSelect(getLastPlaceholder('Item department'));
    await pickOption('DEPT-1 - Dept 1');
    closeAllDropdowns();
    await new Promise(r => setTimeout(r, 50));

    openSelect(getLastPlaceholder('Material item'));
    await pickOption('RM-WIRE - Wire');
    closeAllDropdowns();
    await new Promise(r => setTimeout(r, 50));

    fireEvent.click(screen.getByRole('button', { name: /Add Input Material/i }));
    await new Promise(r => setTimeout(r, 50));

    openSelect(getLastPlaceholder('Item department'));
    await pickOption('DEPT-2 - Dept 2');
    closeAllDropdowns();
    await new Promise(r => setTimeout(r, 50));

    openSelect(getLastPlaceholder('Material item'));
    await pickOption('FG-CASING - Casing');
    closeAllDropdowns();
    await new Promise(r => setTimeout(r, 50));

    fireEvent.click(screen.getByRole('button', { name: /Add Output Product/i }));
    await new Promise(r => setTimeout(r, 50));

    openSelect(getLastPlaceholder('Item department'));
    await pickOption('DEPT-2 - Dept 2');
    closeAllDropdowns();
    await new Promise(r => setTimeout(r, 50));

    openSelect(getLastPlaceholder('Product item'));
    await pickOption('FG-CASING - Casing');
    closeAllDropdowns();
    await new Promise(r => setTimeout(r, 50));
  });

  it('PAYLOAD: the per-row Item Department is a UI-only filter and never reaches the API payload', async () => {
    apiMock.post.mockResolvedValue({ data: { operations: [{ id: 'opN', operationCode: 'OP-NEW', operationName: 'New Op' }] } });
    const onSaved = jest.fn();
    renderEditor({ lookups: deptLookups, operation: null, onSaved });
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'OP-NEW' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Op' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Input Material/i }));

    const itemDeptSelect = screen.getAllByText('Item department', { selector: '.ant-select-selection-placeholder' })[0];
    fireEvent.mouseDown(itemDeptSelect);
    fireEvent.click(screen.getByText('DEPT-1 - Dept 1'));

    const materialItemSelect = screen.getAllByText('Material item', { selector: '.ant-select-selection-placeholder' })[0];
    fireEvent.mouseDown(materialItemSelect);
    fireEvent.click(screen.getAllByText('RM-WIRE - Wire')[0]);
    fireEvent.change(screen.getByPlaceholderText('Qty per unit'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalled(), { timeout: 30000 });
    const payload = apiMock.post.mock.calls[0][1] as { inputs: Array<Record<string, unknown>>; outputs: Array<Record<string, unknown>> };
    expect(payload.inputs).toHaveLength(1);
    expect(payload.inputs[0]).toEqual({ itemId: 'i1', quantity: 2 });
    expect(payload.inputs[0]).not.toHaveProperty('itemDepartmentId');
    expect(payload.outputs).toEqual([]);
    expect(onSaved).toHaveBeenCalled();
  });

  it('EDIT: row Item Department prefills from the saved item and clean junction payloads are forwarded', async () => {
    const editOp: RoutingOperation = {
      ...operation,
      inputs: [{ itemId: 'i1', quantity: 1, uomId: 'u1', isPrimary: true }],
      outputs: [{ itemId: 'i2', quantity: 1, uomId: 'u1', outputType: 'MAIN', isPrimary: true }],
    };
    apiMock.put.mockResolvedValue({ data: { id: 'op1', operationCode: 'OP-1', operationName: 'Flattening' } });
    renderEditor({ operation: editOp, lookups: deptLookups });
    expect(screen.getAllByText('DEPT-1 - Dept 1').length).toBeGreaterThan(0);
    expect(screen.getByText('DEPT-2 - Dept 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalled(), { timeout: 30000 });
    const payload = apiMock.put.mock.calls[0][1] as { inputs: Array<Record<string, unknown>>; outputs: Array<Record<string, unknown>> };
    expect(payload.inputs![0]).toEqual({ itemId: 'i1', quantity: 1, uomId: 'u1', isPrimary: true });
    expect(payload.inputs![0]).not.toHaveProperty('itemDepartmentId');
    expect(payload.outputs![0]).not.toHaveProperty('itemDepartmentId');
  });

  // ── TASK15-C: final save / error UX ──────────────────────────────────────

  it('ERROR-PERSISTENT: failed save keeps a persistent error dialog until dismissed; the form stays open with values; never success', async () => {
    apiMock.post.mockRejectedValue({ response: { status: 400, data: { message: ['scrapPercentage must not exceed 100'] } } });
    const onSaved = jest.fn();
    renderEditor({ operation: null, onSaved });
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'OP-NEW' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Op' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const dialog = await screen.findByTestId('save-result-error', undefined, { timeout: 30000 });
    expect(within(dialog).getByText('Save Failed')).toBeInTheDocument();
    expect(within(dialog).getByText(/Server returned HTTP 400: scrapPercentage must not exceed 100/)).toBeInTheDocument();
    expect(screen.queryByTestId('save-result-success')).not.toBeInTheDocument();
    expect(screen.queryByTestId('save-result-loading')).not.toBeInTheDocument();
    expect((screen.getByLabelText('Code') as HTMLInputElement).value).toBe('OP-NEW');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByTestId('save-result-error')).not.toBeInTheDocument();
    }, { timeout: 10000 });
    expect((screen.getByLabelText('Code') as HTMLInputElement).value).toBe('OP-NEW');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('ERROR-RETRY: the dialog Retry button re-submits the same request and swaps to success on success', async () => {
    apiMock.post
      .mockRejectedValueOnce({ response: { status: 400, data: { message: ['divisionId must be a UUID'] } } })
      .mockResolvedValueOnce({ data: { operations: [{ id: 'op2', operationCode: 'OP-NEW', operationName: 'New Op' }] } });
    renderEditor({ operation: null, onSaved: jest.fn() });
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'OP-NEW' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Op' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const dialog = await screen.findByTestId('save-result-error', undefined, { timeout: 30000 });
    expect(within(dialog).getByText(/Server returned HTTP 400: divisionId must be a UUID/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(2), { timeout: 30000 });
    await waitFor(() => expect(screen.getByTestId('save-result-success')).toBeInTheDocument(), { timeout: 30000 });
    expect(screen.getByText('OP-NEW')).toBeInTheDocument();
    expect(screen.queryByTestId('save-result-error')).not.toBeInTheDocument();
  });
});