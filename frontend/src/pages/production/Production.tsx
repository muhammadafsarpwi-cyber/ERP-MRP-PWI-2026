import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import BomManagement from './BOMManagement';
import RoutingManagement from './RoutingManagement';

const Production: React.FC = () => (
  <Routes>
    <Route index element={<Navigate to="/production/bom" replace />} />
    <Route path="bom" element={<BomManagement />} />
    <Route path="bom/:id" element={<BomManagement />} />
    <Route path="routings" element={<RoutingManagement />} />
    <Route path="routings/:id" element={<RoutingManagement />} />
    <Route path="*" element={<Navigate to="/production/bom" replace />} />
  </Routes>
);

export default Production;
