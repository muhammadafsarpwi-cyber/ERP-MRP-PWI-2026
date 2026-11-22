import React, { useEffect, useState } from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import WorkspaceTabViewport from './WorkspaceTabViewport';
import { useWorkspaceTabStore } from '../../store/workspaceTabStore';
import { useHeaderActions } from './headerActionsStore';

const mountCounts: Record<string, number> = {};
const unmountCounts: Record<string, number> = {};

const StatefulTabPage: React.FC<{ pageKey: string; label: string }> = ({ pageKey, label }) => {
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    mountCounts[pageKey] = (mountCounts[pageKey] || 0) + 1;
    return () => {
      unmountCounts[pageKey] = (unmountCounts[pageKey] || 0) + 1;
    };
  }, [pageKey]);

  return (
    <div data-testid={`page-${pageKey}`}>
      <h2>{label}</h2>
      <input
        aria-label={`${label} Filter`}
        value={filterText}
        onChange={(e) => setFilterText(e.target.value)}
      />
    </div>
  );
};

const Harness: React.FC = () => {
  const navigate = useNavigate();

  const go = (id: string, title: string) => {
    useWorkspaceTabStore.getState().openTab({
      id,
      route: id,
      pathname: id,
      title,
      closable: id !== '/dashboard',
    });
    navigate(id);
  };

  return (
    <div>
      <button onClick={() => go('/dashboard', 'Dashboard')}>Open Dashboard</button>
      <button onClick={() => go('/production/entries', 'Daily Production Entry')}>Open Entries</button>
      <button onClick={() => go('/sales/deliveries', 'Deliveries')}>Open Deliveries</button>
      <button
        onClick={() => {
          const res = useWorkspaceTabStore.getState().closeTab('/production/entries');
          if (res?.nextRoute) navigate(res.nextRoute);
        }}
      >
        Close Entries
      </button>
      <WorkspaceTabViewport>
        <Routes>
          <Route path="/dashboard" element={<StatefulTabPage pageKey="dashboard" label="Dashboard" />} />
          <Route path="/production/entries" element={<StatefulTabPage pageKey="entries" label="Daily Production Entry" />} />
          <Route path="/sales/deliveries" element={<StatefulTabPage pageKey="deliveries" label="Deliveries" />} />
        </Routes>
      </WorkspaceTabViewport>
    </div>
  );
};

describe('WorkspaceTabViewport keep-alive lifecycle', () => {
  beforeAll(() => {
    window.scrollTo = jest.fn();
  });

  beforeEach(() => {
    Object.keys(mountCounts).forEach((k) => delete mountCounts[k]);
    Object.keys(unmountCounts).forEach((k) => delete unmountCounts[k]);
    useWorkspaceTabStore.getState().resetWorkspace();
    useHeaderActions.setState({ tabActionsMap: {}, tabMetaMap: {}, actions: [] });
  });

  it('keeps visited tabs mounted in DOM with preserved local state and zero re-mounts on switch, and cleanly unmounts on close', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Harness />
      </MemoryRouter>,
    );

    expect(mountCounts.dashboard).toBe(1);
    const dashInput = screen.getByLabelText('Dashboard Filter') as HTMLInputElement;
    fireEvent.change(dashInput, { target: { value: 'Spoke Division' } });

    // Switch to Daily Production Entry
    fireEvent.click(screen.getByText('Open Entries'));
    expect(mountCounts.entries).toBe(1);
    expect(unmountCounts.dashboard || 0).toBe(0);

    const entriesInput = screen.getByLabelText('Daily Production Entry Filter') as HTMLInputElement;
    fireEvent.change(entriesInput, { target: { value: 'SOC-2026-05819' } });

    const dashPane = document.getElementById('erp-tab-pane-_dashboard');
    const entriesPane = document.getElementById('erp-tab-pane-_production_entries');
    expect(dashPane).toHaveClass('erp-tab-pane--offscreen');
    expect(entriesPane).toHaveClass('erp-tab-pane--active');

    // Switch to Deliveries and back to Entries — zero unmounts or re-mounts!
    fireEvent.click(screen.getByText('Open Deliveries'));
    expect(mountCounts.deliveries).toBe(1);
    fireEvent.click(screen.getByText('Open Entries'));

    expect(mountCounts.dashboard).toBe(1);
    expect(mountCounts.entries).toBe(1);
    expect(mountCounts.deliveries).toBe(1);
    expect(unmountCounts.dashboard || 0).toBe(0);
    expect(unmountCounts.entries || 0).toBe(0);
    expect((screen.getByLabelText('Dashboard Filter') as HTMLInputElement).value).toBe('Spoke Division');
    expect((screen.getByLabelText('Daily Production Entry Filter') as HTMLInputElement).value).toBe('SOC-2026-05819');

    // Seed header metadata for Entries tab, then close Entries tab
    act(() => {
      useHeaderActions.getState().setHeaderMeta('Daily Entries', 'Test meta', undefined, undefined, '/production/entries');
    });
    expect(useHeaderActions.getState().tabMetaMap['/production/entries']).toBeDefined();

    fireEvent.click(screen.getByText('Close Entries'));
    expect(unmountCounts.entries).toBe(1);
    expect(document.getElementById('erp-tab-pane-_production_entries')).not.toBeInTheDocument();
    expect(useHeaderActions.getState().tabMetaMap['/production/entries']).toBeUndefined();
  });
});
