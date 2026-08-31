import React from 'react';
import { Breadcrumb } from 'antd';
import { Link, useLocation } from 'react-router-dom';

interface RouteLabel {
  pattern: RegExp;
  label: string;
}

const ROUTE_LABELS: RouteLabel[] = [
  { pattern: /^\/dashboard$/, label: 'Dashboard' },
  { pattern: /^\/master-data$/, label: 'Master Data' },
  { pattern: /^\/master-data\/items/, label: 'Products & Items' },
  { pattern: /^\/master-data\/categories/, label: 'Item Categories' },
  { pattern: /^\/master-data\/uom-conversions/, label: 'UOM Conversions' },
  { pattern: /^\/master-data\/uom/, label: 'Units of Measure' },
  { pattern: /^\/master-data\/machines/, label: 'Machine Master' },
  { pattern: /^\/organization\/companies/, label: 'Companies' },
  { pattern: /^\/organization\/branches/, label: 'Branches' },
  { pattern: /^\/organization\/divisions/, label: 'Divisions' },
  { pattern: /^\/organization\/sections/, label: 'Sections' },
  { pattern: /^\/organization\/departments/, label: 'Departments' },
  { pattern: /^\/organization\/warehouses/, label: 'Warehouses' },
  { pattern: /^\/organization\/locations/, label: 'Locations' },
  { pattern: /^\/admin\/users/, label: 'Users' },
  { pattern: /^\/admin\/roles/, label: 'Roles' },
  { pattern: /^\/admin\/permissions/, label: 'Permissions' },
  { pattern: /^\/inventory$/, label: 'Inventory' },
  { pattern: /^\/inventory\/policies/, label: 'Inventory Policies' },
  { pattern: /^\/inventory\/batches/, label: 'Batch Management' },
  { pattern: /^\/inventory\/adjustments/, label: 'Stock Adjustments' },
  { pattern: /^\/inventory\/transfers/, label: 'Stock Transfers' },
  { pattern: /^\/inventory\/reservations/, label: 'Reservations' },
  { pattern: /^\/inventory\/ledger/, label: 'Stock Ledger' },
  { pattern: /^\/inventory\/reports/, label: 'Inventory Reports' },
  { pattern: /^\/procurement\/suppliers/, label: 'Suppliers' },
  { pattern: /^\/procurement\/requisitions/, label: 'Purchase Requisitions' },
  { pattern: /^\/procurement\/rfqs/, label: 'RFQs' },
  { pattern: /^\/procurement\/quotations/, label: 'Quotations' },
  { pattern: /^\/procurement\/orders/, label: 'Purchase Orders' },
  { pattern: /^\/procurement\/receipts/, label: 'Goods Receipts' },
  { pattern: /^\/procurement\/returns/, label: 'Purchase Returns' },
  { pattern: /^\/procurement\/invoices/, label: 'Purchase Invoices' },
  { pattern: /^\/customers/, label: 'Customers' },
  { pattern: /^\/sales\/quotations/, label: 'Sales Quotations' },
  { pattern: /^\/sales\/orders/, label: 'Sales Orders' },
  { pattern: /^\/sales\/deliveries/, label: 'Sales Deliveries' },
  { pattern: /^\/sales\/invoices/, label: 'Sales Invoices' },
  { pattern: /^\/sales\/returns/, label: 'Sales Returns' },
  { pattern: /^\/products/, label: 'Products' },
  { pattern: /^\/production/, label: 'Production' },
  { pattern: /^\/qc\/inspections/, label: 'Inspections' },
  { pattern: /^\/qc\/ncr/, label: 'NCR' },
  { pattern: /^\/qc\/capa/, label: 'CAPA' },
  { pattern: /^\/settings$/, label: 'Settings' },
];

const PARENT_LABELS: Record<string, string> = {
  'master-data': 'Master Data',
  organization: 'Organization',
  admin: 'Administration',
  inventory: 'Inventory',
  procurement: 'Procurement',
  sales: 'Sales',
  production: 'Production',
  qc: 'QC',
};

function getLabelForPath(pathname: string): string | undefined {
  for (const route of ROUTE_LABELS) {
    if (route.pattern.test(pathname)) return route.label;
  }
  return undefined;
}

interface BreadcrumbsProps {
  style?: React.CSSProperties;
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ style }) => {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  const items: Array<{ title: React.ReactNode }> = [
    {
      title: <Link to="/dashboard">Home</Link>,
    },
  ];

  if (segments.length === 0) return null;

  const builtPaths: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    builtPaths.push('/' + segments.slice(0, i + 1).join('/'));
  }

  for (let i = 0; i < builtPaths.length; i++) {
    const path = builtPaths[i];
    const segment = segments[i];

    let label = getLabelForPath(path);
    if (!label && i < builtPaths.length - 1) {
      label = PARENT_LABELS[segment];
    }
    if (!label) {
      label = segment
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    const isLast = i === builtPaths.length - 1;
    items.push({
      title: isLast ? (
        <span style={{ color: 'var(--theme-text, #222)', fontWeight: 500 }}>{label}</span>
      ) : (
        <Link to={path}>{label}</Link>
      ),
    });
  }

  return (
    <Breadcrumb
      items={items}
      style={{ marginBottom: 12, fontSize: 13, ...style }}
    />
  );
};

export default Breadcrumbs;
