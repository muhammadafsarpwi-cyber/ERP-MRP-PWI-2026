import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from 'antd';
import MainLayout from './components/layout/MainLayout';
import Login from './pages/auth/Login';
import Dashboard from './pages/dashboard/Dashboard';
import Products from './pages/products/Products';
import Customers from './pages/customers/Customers';
import SalesOrders from './pages/sales/SalesOrders';
import Inventory from './pages/inventory/Inventory';
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
import DevelopmentStatus from './pages/development/DevelopmentStatus';
import './App.css';

const { Content } = Layout;

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <MainLayout>
            <Content style={{ margin: '24px 16px', padding: 24, minHeight: 280 }}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/products/*" element={<Products />} />
                <Route path="/customers/*" element={<Customers />} />
                <Route path="/sales/*" element={<SalesOrders />} />
                <Route path="/inventory/*" element={<Inventory />} />
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
        }
      />
    </Routes>
  );
};

export default App;
