import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RawReceiptMinimizedDock from './RawReceiptMinimizedDock';
import { useRawReceiptDraftStore } from '../../store/rawReceiptDraftStore';

const ReceivingMarker = () => <div data-testid="receiving-page" />;

const renderDock = (initialPath = '/inventory') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/inventory" element={<RawReceiptMinimizedDock />} />
        <Route path="/production/receiving" element={<ReceivingMarker />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  useRawReceiptDraftStore.setState({
    minimized: false,
    pendingRestore: false,
    draft: null,
    refCache: null,
  });
});

describe('RawReceiptMinimizedDock (RMR-01-A)', () => {
  it('renders nothing when there is no active minimized draft', () => {
    renderDock();
    expect(screen.queryByTestId('rm-persistent-minimized-bar')).not.toBeInTheDocument();
  });

  it('renders label, MINIMIZED badge and line-count metadata for an active draft', () => {
    useRawReceiptDraftStore.setState({
      minimized: true,
      draft: {
        editingId: null,
        values: {},
        rows: [
          { key: 'a', itemId: 'item-1' },
          { key: 'b', itemId: 'item-2' },
          { key: 'c', itemId: undefined },
        ],
      },
    });
    renderDock();

    const bar = screen.getByTestId('rm-persistent-minimized-bar');
    expect(bar).toBeInTheDocument();
    expect(screen.getByText('New Receipt (Gate Pass)')).toBeInTheDocument();
    expect(screen.getByText('MINIMIZED')).toBeInTheDocument();
    expect(screen.getByTestId('rm-dock-lines').textContent).toContain('2 lines');
  });

  it('restore requests the draft and navigates back to the receiving page', async () => {
    useRawReceiptDraftStore.setState({
      minimized: true,
      draft: { editingId: null, values: { gatePassNo: 'GP-X' }, rows: [] },
    });
    renderDock('/inventory');

    fireEvent.click(screen.getByTestId('rm-dock-restore'));

    await waitFor(() => {
      expect(screen.getByTestId('receiving-page')).toBeInTheDocument();
    });
    const st = useRawReceiptDraftStore.getState();
    expect(st.minimized).toBe(false);
    expect(st.pendingRestore).toBe(true);
    expect(st.draft?.values?.gatePassNo).toBe('GP-X');
  });

  it('close discards the draft and hides the bar', async () => {
    useRawReceiptDraftStore.setState({
      minimized: true,
      draft: { editingId: 'rec-1', values: {}, rows: [] },
    });
    renderDock();

    fireEvent.click(screen.getByTestId('rm-dock-close'));

    await waitFor(() => {
      expect(screen.queryByTestId('rm-persistent-minimized-bar')).not.toBeInTheDocument();
    });
    const st = useRawReceiptDraftStore.getState();
    expect(st.draft).toBeNull();
    expect(st.minimized).toBe(false);
  });
});