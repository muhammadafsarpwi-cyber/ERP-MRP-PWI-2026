import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { resolveNavMeta } from '../layout/navigationConfig';
import { useHeaderActions, areReactNodesEqual } from '../layout/headerActionsStore';

interface PageHeaderProps {
  icon: React.ReactNode;
  title: string | React.ReactNode;
  subtitle?: string;
  extra?: React.ReactNode;
  gradient?: string;
  showBreadcrumbs?: boolean;
  style?: React.CSSProperties;
}

/**
 * Page context provider for the single application header.
 *
 * The Main Header now renders the breadcrumb (top row) and the page title +
 * subtitle (title row) for every page. This component therefore no longer
 * renders its own coloured PageHeader card; instead it registers the page's
 * title / subtitle / icon into the shared header store (via setHeaderMeta) and
 * emits only the page's action `extra` as a plain content toolbar.
 *
 * Kept as a drop-in so existing pages keep their title/subtitle/extra while the
 * duplicate secondary header is removed at the layout level.
 */
const PageHeader: React.FC<PageHeaderProps> = ({ icon, title, subtitle, extra }) => {
  const location = useLocation();
  const navMeta = React.useMemo(() => resolveNavMeta(location.pathname), [location.pathname]);
  const HeaderIcon = navMeta?.icon;
  const renderedIcon = React.useMemo(() => (HeaderIcon ? React.createElement(HeaderIcon) : icon), [HeaderIcon, icon]);
  const tabId = location.pathname;

  useEffect(() => {
    useHeaderActions.getState().setHeaderMeta(
      title,
      subtitle,
      renderedIcon,
      extra,
      tabId
    );
  }, [title, subtitle, renderedIcon, extra, tabId]);

  return null;
};

export default PageHeader;
