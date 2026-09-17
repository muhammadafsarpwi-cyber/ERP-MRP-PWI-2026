import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Modal } from 'antd';
import WorkspaceTabStrip from './WorkspaceTabStrip';
import { useWorkspaceTabStore } from '../../store/workspaceTabStore';
import { registerUnsavedChecker, unregisterUnsavedChecker } from '../../store/unsavedChangesRegistry';

const mockedNavigate = jest.fn();

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

describe('WorkspaceTabStrip', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  beforeEach(() => {
    mockedNavigate.mockClear();
    useWorkspaceTabStore.getState().resetWorkspace();
  });

  afterEach(() => {
    unregisterUnsavedChecker('/test-dirty');
    jest.restoreAllMocks();
  });

  it('renders permanent Dashboard tab', () => {
    render(
      <MemoryRouter>
        <WorkspaceTabStrip />
      </MemoryRouter>
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.queryByLabelText('Close Dashboard')).not.toBeInTheDocument();
  });

  it('renders multiple open tabs with titles and close buttons', () => {
    useWorkspaceTabStore.getState().openTab({
      id: '/master-data/items',
      route: '/master-data/items',
      pathname: '/master-data/items',
      title: 'Items',
    });
    useWorkspaceTabStore.getState().openTab({
      id: '/sales/orders',
      route: '/sales/orders',
      pathname: '/sales/orders',
      title: 'Sales Orders',
    });

    render(
      <MemoryRouter>
        <WorkspaceTabStrip />
      </MemoryRouter>
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Items')).toBeInTheDocument();
    expect(screen.getByText('Sales Orders')).toBeInTheDocument();

    expect(screen.getByLabelText('Close Items')).toBeInTheDocument();
    expect(screen.getByLabelText('Close Sales Orders')).toBeInTheDocument();
  });

  it('clicking an inactive tab activates it and navigates to its route', () => {
    useWorkspaceTabStore.getState().openTab({
      id: '/master-data/items',
      route: '/master-data/items',
      pathname: '/master-data/items',
      title: 'Items',
    });
    useWorkspaceTabStore.getState().openTab({
      id: '/sales/orders',
      route: '/sales/orders',
      pathname: '/sales/orders',
      title: 'Sales Orders',
    });

    render(
      <MemoryRouter>
        <WorkspaceTabStrip />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Items'));
    expect(mockedNavigate).toHaveBeenCalledWith('/master-data/items');
    expect(useWorkspaceTabStore.getState().activeTabId).toBe('/master-data/items');
  });

  it('clicking close button closes only that tab and navigates to sensible neighbor', () => {
    useWorkspaceTabStore.getState().openTab({
      id: '/master-data/items',
      route: '/master-data/items',
      pathname: '/master-data/items',
      title: 'Items',
    });

    render(
      <MemoryRouter>
        <WorkspaceTabStrip />
      </MemoryRouter>
    );

    const closeBtn = screen.getByLabelText('Close Items');
    fireEvent.click(closeBtn);

    expect(useWorkspaceTabStore.getState().tabs).toHaveLength(1);
    expect(mockedNavigate).toHaveBeenCalledWith('/dashboard');
  });

  it('protects dirty forms with unsaved changes confirmation dialog', () => {
    const modalSpy = jest.spyOn(Modal, 'confirm').mockImplementation(jest.fn());

    useWorkspaceTabStore.getState().openTab({
      id: '/test-dirty',
      route: '/test-dirty',
      pathname: '/test-dirty',
      title: 'Dirty Form',
    });

    registerUnsavedChecker('/test-dirty', () => true);

    render(
      <MemoryRouter>
        <WorkspaceTabStrip />
      </MemoryRouter>
    );

    const closeBtn = screen.getByLabelText('Close Dirty Form');
    fireEvent.click(closeBtn);

    expect(modalSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Unsaved Changes',
      })
    );

    // Tab is not closed yet
    expect(useWorkspaceTabStore.getState().tabs.some((t) => t.id === '/test-dirty')).toBe(true);
  });
});
