import React, { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropdown, Tooltip, Modal } from 'antd';
import type { MenuProps } from 'antd';
import {
  CloseOutlined,
  HomeOutlined,
  MoreOutlined,
  LeftOutlined,
  RightOutlined,
  ClearOutlined,
  CloseCircleOutlined,
  VerticalRightOutlined,
  VerticalLeftOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { useWorkspaceTabStore, WorkspaceTab } from '../../store/workspaceTabStore';
import { hasUnsavedChanges } from '../../store/unsavedChangesRegistry';
import { resolveNavMeta } from './navigationConfig';
import './workspaceTabStrip.css';

export const WorkspaceTabStrip: React.FC = () => {
  const navigate = useNavigate();
  const tabs = useWorkspaceTabStore((state) => state.tabs);
  const activeTabId = useWorkspaceTabStore((state) => state.activeTabId);
  const activateTab = useWorkspaceTabStore((state) => state.activateTab);
  const closeTab = useWorkspaceTabStore((state) => state.closeTab);
  const closeOtherTabs = useWorkspaceTabStore((state) => state.closeOtherTabs);
  const closeLeftTabs = useWorkspaceTabStore((state) => state.closeLeftTabs);
  const closeRightTabs = useWorkspaceTabStore((state) => state.closeRightTabs);
  const closeAllTabs = useWorkspaceTabStore((state) => state.closeAllTabs);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTrackRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);

  const [headerHeight, setHeaderHeight] = useState<number>(() => {
    if (typeof document !== 'undefined') {
      const headerEl = document.querySelector('.erp-app-header') as HTMLElement | null;
      return headerEl ? headerEl.getBoundingClientRect().height : 0;
    }
    return 0;
  });

  // Dynamically observe and sync Main Header height for sticky offset
  useEffect(() => {
    const updateHeaderHeight = () => {
      const headerEl =
        (containerRef.current?.previousElementSibling as HTMLElement | null) ||
        (document.querySelector('.erp-app-header') as HTMLElement | null);
      if (headerEl) {
        const height = headerEl.getBoundingClientRect().height;
        if (height > 0) {
          setHeaderHeight(height);
          document.documentElement.style.setProperty('--erp-header-height', `${height}px`);
        }
      }
    };

    updateHeaderHeight();

    let resizeObserver: ResizeObserver | null = null;
    const headerEl =
      (containerRef.current?.previousElementSibling as HTMLElement | null) ||
      (document.querySelector('.erp-app-header') as HTMLElement | null);

    if (typeof window !== 'undefined' && 'ResizeObserver' in window && headerEl) {
      resizeObserver = new ResizeObserver(() => {
        updateHeaderHeight();
      });
      resizeObserver.observe(headerEl);
    }

    window.addEventListener('resize', updateHeaderHeight);
    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', updateHeaderHeight);
    };
  }, []);

  // Auto-scroll active tab into view when activeTabId changes
  useEffect(() => {
    if (activeTabRef.current && typeof activeTabRef.current.scrollIntoView === 'function') {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [activeTabId]);

  // Handle horizontal mouse wheel scroll on tab track
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollTrackRef.current) {
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
        scrollTrackRef.current.scrollLeft += e.deltaY;
      }
    }
  };

  const handleScrollLeft = () => {
    if (scrollTrackRef.current) {
      scrollTrackRef.current.scrollBy({ left: -200, behavior: 'smooth' });
    }
  };

  const handleScrollRight = () => {
    if (scrollTrackRef.current) {
      scrollTrackRef.current.scrollBy({ left: 200, behavior: 'smooth' });
    }
  };

  const handleTabClick = (tab: WorkspaceTab) => {
    if (tab.id === activeTabId) return;
    activateTab(tab.id);
    navigate(tab.route);
  };

  const confirmAndClose = (tabId: string, action: () => { nextRoute?: string } | undefined) => {
    if (hasUnsavedChanges(tabId)) {
      Modal.confirm({
        title: 'Unsaved Changes',
        content: 'You have unsaved changes on this page. Are you sure you want to close this tab and discard changes?',
        okText: 'Discard & Close',
        okType: 'danger',
        cancelText: 'Keep Editing',
        onOk: () => {
          const res = action();
          if (res?.nextRoute) {
            navigate(res.nextRoute);
          }
        },
      });
      return;
    }

    const res = action();
    if (res?.nextRoute) {
      navigate(res.nextRoute);
    }
  };

  const handleCloseTab = (e: React.MouseEvent, tab: WorkspaceTab) => {
    e.stopPropagation();
    confirmAndClose(tab.id, () => closeTab(tab.id));
  };

  // Build context menu for a tab
  const getTabContextMenu = (tab: WorkspaceTab, index: number): MenuProps => {
    const isDashboard = tab.id === '/dashboard';
    const hasLeft = index > 1; // index 0 is dashboard, so left tabs exist if index > 1
    const hasRight = index < tabs.length - 1;
    const hasOthers = tabs.length > 2 || (!isDashboard && tabs.length > 1);

    const items: MenuProps['items'] = [
      ...(!isDashboard
        ? [
            {
              key: 'close-current',
              icon: <CloseOutlined />,
              label: 'Close Tab',
              onClick: () => confirmAndClose(tab.id, () => closeTab(tab.id)),
            },
          ]
        : []),
      ...(hasOthers
        ? [
            {
              key: 'close-others',
              icon: <CloseCircleOutlined />,
              label: 'Close Others',
              onClick: () => confirmAndClose(tab.id, () => closeOtherTabs(tab.id)),
            },
          ]
        : []),
      ...(hasRight
        ? [
            {
              key: 'close-right',
              icon: <VerticalRightOutlined />,
              label: 'Close Tabs to the Right',
              onClick: () => confirmAndClose(tab.id, () => closeRightTabs(tab.id)),
            },
          ]
        : []),
      ...(hasLeft
        ? [
            {
              key: 'close-left',
              icon: <VerticalLeftOutlined />,
              label: 'Close Tabs to the Left',
              onClick: () => confirmAndClose(tab.id, () => closeLeftTabs(tab.id)),
            },
          ]
        : []),
      {
        type: 'divider',
      },
      {
        key: 'close-all',
        icon: <ClearOutlined />,
        label: 'Close All Tabs',
        disabled: tabs.length <= 1,
        onClick: () => {
          const res = closeAllTabs();
          if (res?.nextRoute) {
            navigate(res.nextRoute);
          }
        },
      },
    ];

    return { items };
  };

  // Quick Open Tabs Overflow Menu
  const openTabsMenu: MenuProps = {
    items: [
      ...tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const navMeta = resolveNavMeta(tab.pathname);
        const IconComponent = navMeta?.icon || (tab.id === '/dashboard' ? HomeOutlined : null);

        return {
          key: tab.id,
          icon: IconComponent ? <IconComponent style={{ color: navMeta?.colorVar }} /> : null,
          label: (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ fontWeight: isActive ? 600 : 400 }}>{tab.title}</span>
              {isActive && <CheckOutlined style={{ color: '#4f46e5', fontSize: 12 }} />}
            </div>
          ),
          onClick: () => {
            activateTab(tab.id);
            navigate(tab.route);
          },
        };
      }),
      {
        type: 'divider',
      },
      {
        key: 'close-all-overflow',
        icon: <ClearOutlined />,
        label: 'Close All Tabs',
        disabled: tabs.length <= 1,
        onClick: () => {
          const res = closeAllTabs();
          if (res?.nextRoute) {
            navigate(res.nextRoute);
          }
        },
      },
    ],
  };

  return (
    <div
      ref={containerRef}
      className="erp-workspace-tabstrip-container"
      role="tablist"
      aria-label="Open Workspace Pages"
      style={{
        top: headerHeight > 0 ? `${headerHeight}px` : 'var(--erp-header-height, 0px)',
      }}
    >
      {/* Scroll Left Button */}
      <button
        type="button"
        className="erp-tabstrip-arrow-btn"
        onClick={handleScrollLeft}
        aria-label="Scroll tabs left"
        title="Scroll left"
      >
        <LeftOutlined />
      </button>

      {/* Tabs Scroll Track */}
      <div
        ref={scrollTrackRef}
        className="erp-tabstrip-scroll-track"
        onWheel={handleWheel}
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const navMeta = resolveNavMeta(tab.pathname);
          const IconComponent = navMeta?.icon || (tab.id === '/dashboard' ? HomeOutlined : null);

          return (
            <Dropdown
              key={tab.id}
              menu={getTabContextMenu(tab, index)}
              trigger={['contextMenu']}
            >
              <div
                ref={isActive ? activeTabRef : null}
                role="tab"
                aria-selected={isActive}
                tabIndex={0}
                className={`erp-workspace-tab ${isActive ? 'erp-workspace-tab--active' : ''}`}
                onClick={() => handleTabClick(tab)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleTabClick(tab);
                  }
                }}
              >
                {IconComponent && (
                  <span className="erp-tab-icon" style={{ color: navMeta?.colorVar }}>
                    <IconComponent />
                  </span>
                )}
                <span className="erp-tab-title" title={tab.title}>
                  {tab.title}
                </span>

                {tab.closable && (
                  <Tooltip title="Close tab (Middle click or ×)" mouseEnterDelay={0.6}>
                    <span
                      role="button"
                      tabIndex={-1}
                      className="erp-tab-close-btn"
                      onClick={(e) => handleCloseTab(e, tab)}
                      onMouseDown={(e) => {
                        // Support middle-click to close
                        if (e.button === 1) {
                          e.preventDefault();
                          handleCloseTab(e, tab);
                        }
                      }}
                      aria-label={`Close ${tab.title}`}
                    >
                      <CloseOutlined />
                    </span>
                  </Tooltip>
                )}
              </div>
            </Dropdown>
          );
        })}
      </div>

      {/* Scroll Right Button */}
      <button
        type="button"
        className="erp-tabstrip-arrow-btn"
        onClick={handleScrollRight}
        aria-label="Scroll tabs right"
        title="Scroll right"
      >
        <RightOutlined />
      </button>

      {/* Quick Actions / Overflow Menu */}
      <div className="erp-tabstrip-actions">
        <Dropdown menu={openTabsMenu} trigger={['click']} placement="bottomRight">
          <button
            type="button"
            className="erp-tabstrip-action-btn"
            title={`Open Pages (${tabs.length})`}
            aria-label="List open pages"
          >
            <MoreOutlined />
          </button>
        </Dropdown>
      </div>
    </div>
  );
};

export default WorkspaceTabStrip;
