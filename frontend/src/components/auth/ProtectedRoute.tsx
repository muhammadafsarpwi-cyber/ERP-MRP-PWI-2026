import React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Result, Button, Spin } from 'antd';
import { usePermission } from '../../hooks/usePermission';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ROUTE_PERMISSION_MAP: Record<string, string[]> = {
  '/organization/companies': ['organization.company.view'],
  '/organization/branches': ['organization.branch.view'],
  '/organization/divisions': ['organization.division.view'],
  '/organization/sections': ['organization.section.view'],
  '/organization/departments': ['organization.department.view'],
  '/organization/warehouses': ['organization.warehouse.view'],
  '/organization/locations': ['organization.warehouse.view'],
  '/admin/users': ['admin.users.view'],
  '/admin/roles': ['admin.roles.view'],
  '/admin/permissions': ['admin.permissions.view'],
  '/admin/permissions-matrix': ['admin.roles.view'],
  '/master-data/items': ['item.item.view'],
  '/master-data/categories': ['item.item_category.view'],
  '/master-data/uom': ['item.uom.view'],
  '/master-data/uom-conversions': ['item.uom_conversion.view'],
  '/master-data/machines': ['manufacturing.machine.view'],
  '/customers': ['customer.customer.view'],
  '/sales/quotations': ['sales.quotations.view'],
  '/sales/orders': ['sales.orders.view'],
  '/sales/deliveries': ['sales.deliveries.view'],
  '/sales/invoices': ['sales.invoices.view'],
  '/sales/returns': ['sales.returns.view'],
  '/procurement/suppliers': ['procurement.supplier.view'],
  '/procurement/requisitions': ['procurement.requisition.view'],
  '/procurement/rfqs': ['procurement.rfq.view'],
  '/procurement/quotations': ['procurement.quotation.view'],
  '/procurement/orders': ['procurement.order.view'],
  '/procurement/receipts': ['procurement.receipt.view'],
  '/procurement/returns': ['procurement.return.view'],
  '/procurement/invoices': ['procurement.invoice.view'],
  '/inventory': ['inventory.inventory.view'],
  '/inventory/policies': ['inventory.policy.view'],
  '/inventory/batches': ['inventory.batch.view'],
  '/inventory/adjustments': ['inventory.adjustment.view'],
  '/inventory/transfers': ['inventory.transfer.view'],
  '/inventory/reservations': ['inventory.reservation.view'],
  '/inventory/ledger': ['inventory.inventory.view'],
  '/inventory/reports': ['inventory.inventory.view'],
  '/production/entries': ['manufacturing.production.entries.view'],
  '/production/bom': ['manufacturing.bom.view'],
  '/production/routings': ['manufacturing.routing.view'],
  '/production/targets': ['manufacturing.machine_target.view'],
  '/maintenance': ['maintenance.job_card.view'],
  '/maintenance/job-cards': ['maintenance.job_card.view'],
  '/maintenance/teams': ['maintenance.team.view'],
  '/maintenance/categories': ['maintenance.category.view'],
  '/maintenance/preventive-maintenance': ['maintenance.pm.view'],
};

function matchRoute(pathname: string): string | null {
  if (ROUTE_PERMISSION_MAP[pathname]) return pathname;
  const segments = pathname.split('/').filter(Boolean);
  for (let i = segments.length; i > 0; i--) {
    const partial = '/' + segments.slice(0, i).join('/');
    if (ROUTE_PERMISSION_MAP[partial]) return partial;
  }
  return null;
}

const UnauthorizedPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <Result
      status="403"
      title="Access Denied"
      subTitle="You don't have permission to access this page."
      extra={
        <Button type="primary" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </Button>
      }
    />
  );
};

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const token = localStorage.getItem('token');
  const location = useLocation();
  const { can, isLoaded } = usePermission();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isLoaded) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <Spin size="large" />
      </div>
    );
  }

  const matchedRoute = matchRoute(location.pathname);
  if (matchedRoute) {
    const requiredPermissions = ROUTE_PERMISSION_MAP[matchedRoute];
    if (requiredPermissions && requiredPermissions.length > 0) {
      const hasAccess = requiredPermissions.some(p => can(p));
      if (!hasAccess) {
        return <UnauthorizedPage />;
      }
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
