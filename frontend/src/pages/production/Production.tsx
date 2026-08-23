import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import BomManagement from './BOMManagement';
import RoutingManagement from './RoutingManagement';
import ProductionEntries from './ProductionEntries';
import TargetManagement from './TargetManagement';

const Production: React.FC = () => (
  <Routes>
    <Route index element={<Navigate to="/production/entries" replace />} />
    <Route path="entries/*" element={<ProductionEntries />} />
    <Route path="bom" element={<BomManagement />} />
    <Route path="bom/:id" element={<BomManagement />} />
    <Route path="routings" element={<RoutingManagement />} />
    <Route path="routings/:id" element={<RoutingManagement />} />
    <Route path="targets" element={<TargetManagement />} />
    <Route path="targets/:id" element={<TargetManagement />} />
    <Route path="*" element={<Navigate to="/production/entries" replace />} />
  </Routes>
);

export default Production;
