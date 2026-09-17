import { useWorkspaceTabStore, DASHBOARD_TAB } from './workspaceTabStore';

describe('workspaceTabStore', () => {
  beforeEach(() => {
    useWorkspaceTabStore.getState().resetWorkspace();
  });

  it('initializes with Dashboard tab as permanent and unclosable', () => {
    const { tabs, activeTabId } = useWorkspaceTabStore.getState();
    expect(tabs).toHaveLength(1);
    expect(tabs[0].id).toBe('/dashboard');
    expect(tabs[0].closable).toBe(false);
    expect(activeTabId).toBe('/dashboard');
  });

  it('opens a new tab and makes it active', () => {
    useWorkspaceTabStore.getState().openTab({
      id: '/master-data/items',
      route: '/master-data/items',
      pathname: '/master-data/items',
      title: 'Items',
    });

    const { tabs, activeTabId } = useWorkspaceTabStore.getState();
    expect(tabs).toHaveLength(2);
    expect(tabs[1].id).toBe('/master-data/items');
    expect(tabs[1].title).toBe('Items');
    expect(tabs[1].closable).toBe(true);
    expect(activeTabId).toBe('/master-data/items');
  });

  it('CRITICAL: opening an already opened page does NOT create a duplicate tab', () => {
    // Open Items
    useWorkspaceTabStore.getState().openTab({
      id: '/master-data/items',
      route: '/master-data/items',
      pathname: '/master-data/items',
      title: 'Items',
    });

    // Open Categories
    useWorkspaceTabStore.getState().openTab({
      id: '/master-data/categories',
      route: '/master-data/categories',
      pathname: '/master-data/categories',
      title: 'Categories',
    });

    expect(useWorkspaceTabStore.getState().tabs).toHaveLength(3);
    expect(useWorkspaceTabStore.getState().activeTabId).toBe('/master-data/categories');

    // User clicks Items again from sidebar
    useWorkspaceTabStore.getState().openTab({
      id: '/master-data/items',
      route: '/master-data/items',
      pathname: '/master-data/items',
      title: 'Items',
    });

    // Still exactly 3 tabs, and Items is now active!
    const { tabs, activeTabId } = useWorkspaceTabStore.getState();
    expect(tabs).toHaveLength(3);
    expect(activeTabId).toBe('/master-data/items');
    expect(tabs.map((t) => t.id)).toEqual([
      '/dashboard',
      '/master-data/items',
      '/master-data/categories',
    ]);
  });

  it('does not allow closing the Dashboard tab', () => {
    const result = useWorkspaceTabStore.getState().closeTab('/dashboard');
    expect(result).toBeUndefined();
    expect(useWorkspaceTabStore.getState().tabs).toHaveLength(1);
    expect(useWorkspaceTabStore.getState().tabs[0].id).toBe('/dashboard');
  });

  it('closes a tab and activates sensible neighbor', () => {
    // Open Tab 1, 2, 3
    useWorkspaceTabStore.getState().openTab({
      id: '/tab-1',
      route: '/tab-1',
      pathname: '/tab-1',
      title: 'Tab 1',
    });
    useWorkspaceTabStore.getState().openTab({
      id: '/tab-2',
      route: '/tab-2',
      pathname: '/tab-2',
      title: 'Tab 2',
    });
    useWorkspaceTabStore.getState().openTab({
      id: '/tab-3',
      route: '/tab-3',
      pathname: '/tab-3',
      title: 'Tab 3',
    });

    expect(useWorkspaceTabStore.getState().activeTabId).toBe('/tab-3');

    // Close Tab 3 (which is active) -> activates Tab 2 (previous neighbor)
    const res1 = useWorkspaceTabStore.getState().closeTab('/tab-3');
    expect(res1?.nextRoute).toBe('/tab-2');
    expect(useWorkspaceTabStore.getState().activeTabId).toBe('/tab-2');
    expect(useWorkspaceTabStore.getState().tabs.map((t) => t.id)).toEqual([
      '/dashboard',
      '/tab-1',
      '/tab-2',
    ]);

    // Close Tab 1 (which is NOT active) -> active remains Tab 2
    const res2 = useWorkspaceTabStore.getState().closeTab('/tab-1');
    expect(res2?.nextRoute).toBeUndefined();
    expect(useWorkspaceTabStore.getState().activeTabId).toBe('/tab-2');
    expect(useWorkspaceTabStore.getState().tabs.map((t) => t.id)).toEqual([
      '/dashboard',
      '/tab-2',
    ]);
  });

  it('closeOtherTabs closes all tabs except target and Dashboard', () => {
    useWorkspaceTabStore.getState().openTab({
      id: '/tab-1',
      route: '/tab-1',
      pathname: '/tab-1',
      title: 'Tab 1',
    });
    useWorkspaceTabStore.getState().openTab({
      id: '/tab-2',
      route: '/tab-2',
      pathname: '/tab-2',
      title: 'Tab 2',
    });
    useWorkspaceTabStore.getState().openTab({
      id: '/tab-3',
      route: '/tab-3',
      pathname: '/tab-3',
      title: 'Tab 3',
    });

    const res = useWorkspaceTabStore.getState().closeOtherTabs('/tab-2');
    expect(res.nextRoute).toBe('/tab-2');
    expect(useWorkspaceTabStore.getState().tabs.map((t) => t.id)).toEqual([
      '/dashboard',
      '/tab-2',
    ]);
    expect(useWorkspaceTabStore.getState().activeTabId).toBe('/tab-2');
  });

  it('closeAllTabs closes everything except Dashboard and activates Dashboard', () => {
    useWorkspaceTabStore.getState().openTab({
      id: '/tab-1',
      route: '/tab-1',
      pathname: '/tab-1',
      title: 'Tab 1',
    });
    useWorkspaceTabStore.getState().openTab({
      id: '/tab-2',
      route: '/tab-2',
      pathname: '/tab-2',
      title: 'Tab 2',
    });

    const res = useWorkspaceTabStore.getState().closeAllTabs();
    expect(res.nextRoute).toBe('/dashboard');
    expect(useWorkspaceTabStore.getState().tabs.map((t) => t.id)).toEqual([
      '/dashboard',
    ]);
    expect(useWorkspaceTabStore.getState().activeTabId).toBe('/dashboard');
  });

  it('closeRightTabs closes tabs to the right of the given tab', () => {
    useWorkspaceTabStore.getState().openTab({
      id: '/tab-1',
      route: '/tab-1',
      pathname: '/tab-1',
      title: 'Tab 1',
    });
    useWorkspaceTabStore.getState().openTab({
      id: '/tab-2',
      route: '/tab-2',
      pathname: '/tab-2',
      title: 'Tab 2',
    });
    useWorkspaceTabStore.getState().openTab({
      id: '/tab-3',
      route: '/tab-3',
      pathname: '/tab-3',
      title: 'Tab 3',
    });

    useWorkspaceTabStore.getState().closeRightTabs('/tab-1');
    expect(useWorkspaceTabStore.getState().tabs.map((t) => t.id)).toEqual([
      '/dashboard',
      '/tab-1',
    ]);
  });

  it('closeLeftTabs closes tabs to the left of the given tab except Dashboard', () => {
    useWorkspaceTabStore.getState().openTab({
      id: '/tab-1',
      route: '/tab-1',
      pathname: '/tab-1',
      title: 'Tab 1',
    });
    useWorkspaceTabStore.getState().openTab({
      id: '/tab-2',
      route: '/tab-2',
      pathname: '/tab-2',
      title: 'Tab 2',
    });
    useWorkspaceTabStore.getState().openTab({
      id: '/tab-3',
      route: '/tab-3',
      pathname: '/tab-3',
      title: 'Tab 3',
    });

    useWorkspaceTabStore.getState().closeLeftTabs('/tab-2');
    expect(useWorkspaceTabStore.getState().tabs.map((t) => t.id)).toEqual([
      '/dashboard',
      '/tab-2',
      '/tab-3',
    ]);
  });
});
