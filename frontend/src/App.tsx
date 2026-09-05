import React from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Layout } from 'antd';
import MainLayout from './components/layout/MainLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Welcome from './pages/auth/Welcome';
import Login from './pages/auth/Login';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import ChangePassword from './pages/auth/ChangePassword';
import Dashboard from './pages/dashboard/Dashboard';
import Products from './pages/products/Products';
import { CustomerManagement } from './pages/customers';
import FinancePage from './pages/finance/FinancePage';
import ChartOfAccounts from './pages/finance/ChartOfAccounts';
import JournalEntries from './pages/finance/JournalEntries';
import FinanceReports from './pages/finance/FinanceReports';
import ProductionOrders from './pages/production/ProductionOrders';
import EmployeesPage from './pages/hr/Employees';
import AttendanceLeave from './pages/hr/AttendanceLeave';
import QcPage from './pages/qc/QcPage';
import NotificationsPage from './pages/notifications/NotificationsPage';
import {
  EmailSettingsPage,
  WhatsAppSettingsPage,
  EmailTemplatesPage,
  WhatsAppTemplatesPage,
  EmailLogsPage,
  WhatsAppLogsPage,
  NotificationRulesPage,
  NotificationPreferencesPage,
  CommunicationCenterPage,
} from './pages/communication';
import {
  SalesQuotationManagement,
  SalesOrderManagement,
  SalesDeliveryManagement,
  SalesInvoiceManagement,
  SalesReturnManagement,
} from './pages/sales';
import {
  Inventory,
  InventoryPolicyManagement,
  BatchManagement,
  StockAdjustmentManagement,
  StockTransferManagement,
  ReservationManagement,
  StockLedgerView,
  InventoryReports,
} from './pages/inventory';
import Production from './pages/production/Production';
import {
  CompanyManagement,
  BranchManagement,
  DivisionManagement,
  SectionManagement,
  DepartmentManagement,
  WarehouseManagement,
  LocationManagement,
} from './pages/organization';
import {
  UserManagement,
  RoleManagement,
  PermissionManagement,
  PermissionMatrix,
} from './pages/admin';
import {
  ItemManagement,
  CategoryManagement,
  RouteTypeManagement,
  UomManagement,
  UomConversionManagement,
  MachineManagement,
} from './pages/master-data';
import {
  SupplierManagement,
  PurchaseRequisitionManagement,
  RfqManagement,
  QuotationManagement,
  PurchaseOrderManagement,
  GoodsReceiptManagement,
  PurchaseReturnManagement,
  PurchaseInvoiceManagement,
} from './pages/procurement';
import DevelopmentStatus from './pages/development/DevelopmentStatus';
import Settings from './pages/settings';
import ProfilePage from './pages/profile/ProfilePage';
import { MaintenanceDashboard, JobCardList, JobCardCreate, JobCardDetail, PmPlansList, PmSchedules, TeamsList, CategoriesList, MaintenanceReports } from './pages/maintenance';
import './App.css';

const { Content } = Layout;

const MachineMasterDeepLink: React.FC = () => {
  const { machineId } = useParams();
  return <MachineManagement initialMachineId={machineId} />;
};

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <MainLayout>
              <Content style={{ margin: '24px 16px', padding: 24, minHeight: 280, overflow: 'visible' }}>
                <Routes>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/change-password" element={<ChangePassword />} />
                  <Route path="/products/*" element={<Products />} />
                  <Route path="/customers" element={<CustomerManagement />} />
                  <Route path="/sales/quotations" element={<SalesQuotationManagement />} />
                  <Route path="/sales/orders" element={<SalesOrderManagement />} />
                  <Route path="/sales/deliveries" element={<SalesDeliveryManagement />} />
                  <Route path="/sales/invoices" element={<SalesInvoiceManagement />} />
                  <Route path="/sales/returns" element={<SalesReturnManagement />} />
                  <Route path="/inventory" element={<Inventory />} />
                <Route path="/inventory/receiving" element={<Navigate to="/production/receiving" replace />} />
                  <Route path="/inventory/policies" element={<InventoryPolicyManagement />} />
                  <Route path="/inventory/batches" element={<BatchManagement />} />
                  <Route path="/inventory/adjustments" element={<StockAdjustmentManagement />} />
                  <Route path="/inventory/transfers" element={<StockTransferManagement />} />
                  <Route path="/inventory/reservations" element={<ReservationManagement />} />
                  <Route path="/inventory/ledger" element={<StockLedgerView />} />
                  <Route path="/inventory/reports" element={<InventoryReports />} />
                  <Route path="/procurement/suppliers" element={<SupplierManagement />} />
                  <Route path="/procurement/requisitions" element={<PurchaseRequisitionManagement />} />
                  <Route path="/procurement/rfqs" element={<RfqManagement />} />
                  <Route path="/procurement/quotations" element={<QuotationManagement />} />
                  <Route path="/procurement/orders" element={<PurchaseOrderManagement />} />
                  <Route path="/procurement/receipts" element={<GoodsReceiptManagement />} />
                  <Route path="/procurement/returns" element={<PurchaseReturnManagement />} />
                  <Route path="/procurement/invoices" element={<PurchaseInvoiceManagement />} />
                  <Route path="/production/*" element={<Production />} />
                  <Route path="/maintenance" element={<MaintenanceDashboard />} />
                  <Route path="/maintenance/job-cards" element={<JobCardList />} />
                  <Route path="/maintenance/job-cards/new" element={<JobCardCreate />} />
                  <Route path="/maintenance/job-cards/:id" element={<JobCardDetail />} />
                  <Route path="/maintenance/teams" element={<TeamsList />} />
                  <Route path="/maintenance/categories" element={<CategoriesList />} />
                  <Route path="/maintenance/preventive-maintenance" element={<PmPlansList />} />
                  <Route path="/maintenance/pm-plans" element={<PmPlansList />} />
                  <Route path="/maintenance/pm-schedules" element={<PmSchedules />} />
                  <Route path="/maintenance/reports" element={<MaintenanceReports />} />
                  <Route path="/finance" element={<FinancePage />} />
                  <Route path="/finance/accounts" element={<ChartOfAccounts />} />
                  <Route path="/finance/journals" element={<JournalEntries />} />
                  <Route path="/finance/journals/new" element={<JournalEntries />} />
                  <Route path="/finance/reports/*" element={<FinanceReports />} />
                  <Route path="/production/orders" element={<ProductionOrders />} />
                  <Route path="/hr/employees" element={<EmployeesPage />} />
                  <Route path="/hr/attendance" element={<AttendanceLeave />} />
                  <Route path="/hr/leave" element={<AttendanceLeave />} />
                  <Route path="/hr/shifts" element={<AttendanceLeave />} />
                  <Route path="/hr/holidays" element={<AttendanceLeave />} />
                  <Route path="/qc" element={<QcPage />} />
                  <Route path="/qc/inspections" element={<QcPage />} />
                  <Route path="/qc/ncr" element={<QcPage />} />
                  <Route path="/qc/capa" element={<QcPage />} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/notifications/settings" element={<NotificationPreferencesPage />} />
                  <Route path="/notifications/preferences" element={<NotificationPreferencesPage />} />
                  <Route path="/communication" element={<CommunicationCenterPage />} />
                  <Route path="/communication/email" element={<Navigate to="/communication/email-settings" replace />} />
                  <Route path="/communication/whatsapp" element={<Navigate to="/communication/whatsapp-settings" replace />} />
                  <Route path="/communication/email-settings" element={<EmailSettingsPage />} />
                  <Route path="/communication/email-templates" element={<EmailTemplatesPage channel="EMAIL" title="Email Templates" />} />
                  <Route path="/communication/email-logs" element={<EmailLogsPage channel="EMAIL" title="Email Delivery Logs" />} />
                  <Route path="/communication/whatsapp-settings" element={<WhatsAppSettingsPage />} />
                  <Route path="/communication/whatsapp-templates" element={<WhatsAppTemplatesPage channel="WHATSAPP" title="WhatsApp Templates" />} />
                  <Route path="/communication/whatsapp-logs" element={<WhatsAppLogsPage channel="WHATSAPP" title="WhatsApp Delivery Logs" />} />
                  <Route path="/communication/rules" element={<NotificationRulesPage />} />
                  <Route path="/organization/companies" element={<CompanyManagement />} />
                  <Route path="/organization/branches" element={<BranchManagement />} />
                  <Route path="/organization/divisions" element={<DivisionManagement />} />
                  <Route path="/organization/sections" element={<SectionManagement />} />
                  <Route path="/organization/departments" element={<DepartmentManagement />} />
                  <Route path="/organization/warehouses" element={<WarehouseManagement />} />
                  <Route path="/organization/locations" element={<LocationManagement />} />
                  <Route path="/admin/users" element={<UserManagement />} />
                  <Route path="/admin/roles" element={<RoleManagement />} />
                  <Route path="/admin/permissions" element={<PermissionManagement />} />
                  <Route path="/admin/permissions-matrix" element={<PermissionMatrix />} />
                  <Route path="/master-data/items" element={<ItemManagement />} />
                  <Route path="/master-data/categories" element={<CategoryManagement />} />
                  <Route path="/master-data/route-types" element={<RouteTypeManagement />} />
                  <Route path="/master-data/uom" element={<UomManagement />} />
                  <Route path="/master-data/uom-conversions" element={<UomConversionManagement />} />
                  <Route path="/master-data/machines" element={<MachineManagement />} />
                  <Route path="/production/machines" element={<Navigate to="/master-data/machines" replace />} />
                  <Route path="/production/machines/:machineId" element={<MachineMasterDeepLink />} />
                  {process.env.NODE_ENV !== 'production' && (
                    <Route path="/development/status" element={<DevelopmentStatus />} />
                  )}
                </Routes>
              </Content>
            </MainLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

export default App;
