import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from 'antd';
import MainLayout from './components/layout/MainLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Login from './pages/auth/Login';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import ChangePassword from './pages/auth/ChangePassword';
import Dashboard from './pages/dashboard/Dashboard';
import Products from './pages/products/Products';
import { CustomerManagement } from './pages/customers';
import SalesOrders from './pages/sales/SalesOrders';
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
} from './pages/admin';
import {
  ItemManagement,
  CategoryManagement,
  UomManagement,
  UomConversionManagement,
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
import './App.css';

const { Content } = Layout;

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <MainLayout>
              <Content style={{ margin: '24px 16px', padding: 24, minHeight: 280 }}>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/change-password" element={<ChangePassword />} />
                  <Route path="/products/*" element={<Products />} />
                  <Route path="/customers" element={<CustomerManagement />} />
                  <Route path="/sales/*" element={<SalesOrders />} />
                  <Route path="/inventory" element={<Inventory />} />
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
                  <Route path="/master-data/items" element={<ItemManagement />} />
                  <Route path="/master-data/categories" element={<CategoryManagement />} />
                  <Route path="/master-data/uom" element={<UomManagement />} />
                  <Route path="/master-data/uom-conversions" element={<UomConversionManagement />} />
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
