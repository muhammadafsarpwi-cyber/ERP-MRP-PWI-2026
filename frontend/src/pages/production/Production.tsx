import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProductionDashboard from './ProductionDashboard';
import ProductionReports from './ProductionReports';
import BomManagement from './BOMManagement';
import RoutingManagement from './RoutingManagement';
import ProductionEntries from './ProductionEntries';
import TargetManagement from './TargetManagement';
import Traceability from './Traceability';

const Production: React.FC = () => (
  <Routes>
    <Route index element={<Navigate to="/production/dashboard" replace />} />
    <Route path="dashboard" element={<ProductionDashboard />} />
    <Route path="reports" element={<ProductionReports />} />
    <Route path="entries/*" element={<ProductionEntries />} />
    <Route path="bom" element={<BomManagement />} />
    <Route path="bom/:id" element={<BomManagement />} />
    <Route path="routings" element={<RoutingManagement />} />
    <Route path="routings/:id" element={<RoutingManagement />} />
    <Route path="targets" element={<TargetManagement />} />
    <Route path="targets/:id" element={<TargetManagement />} />
    <Route path="traceability" element={<Traceability />} />
    <Route path="*" element={<Navigate to="/production/dashboard" replace />} />
  </Routes>
);

export default Production;
