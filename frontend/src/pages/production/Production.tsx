import React from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import ProductionDashboard from './ProductionDashboard';
import ProductionReports from './ProductionReports';
import ProductionOrders from './ProductionOrders';
import ProductionItemOpenStock from './ProductionItemOpenStock';
import BomManagement from './BOMManagement';
import FinishedGoodBomSetup from './bom/FinishedGoodBomSetup';
import RoutingManagement from './RoutingManagement';
import ProductionEntries from './ProductionEntries';
import TargetManagement from './TargetManagement';
import Traceability from './Traceability';
import ProductionInventoryReport from './ProductionInventoryReport';
import RawMaterialReceiving from './receiving/RawMaterialReceiving';
import RawMaterialReturn from './returns/RawMaterialReturn';
import ReceivingReport from './receiving/ReceivingReport';
import { ProductionUnitsPage } from './units';
import { MachineManagement } from '../master-data';
import HandPackingEntry from './packing/HandPackingEntry';
import PackingDepartmentHub from './packing/PackingDepartmentHub';

const MachineMasterDeepLink: React.FC = () => {
  const { machineId } = useParams();
  return <MachineManagement initialMachineId={machineId} />;
};

const Production: React.FC = () => (
  <Routes>
    <Route index element={<Navigate to="/production/dashboard" replace />} />
    <Route path="dashboard" element={<ProductionDashboard />} />
    <Route path="open-stock" element={<ProductionItemOpenStock />} />
    <Route path="orders" element={<ProductionOrders />} />
    <Route path="reports" element={<ProductionReports />} />
    <Route path="packing/*" element={<PackingDepartmentHub />} />
    <Route path="packing" element={<PackingDepartmentHub />} />
    <Route path="packing-dept/*" element={<PackingDepartmentHub />} />
    <Route path="packing-dept" element={<PackingDepartmentHub />} />
    <Route path="entries/*" element={<ProductionEntries />} />
    <Route path="units" element={<ProductionUnitsPage />} />
    <Route path="receiving" element={<RawMaterialReceiving />} />
    <Route path="returns" element={<RawMaterialReturn />} />
    <Route path="receiving-report" element={<ReceivingReport />} />
    <Route path="bom" element={<BomManagement />} />
    <Route path="bom/config" element={<PackingDepartmentHub />} />
    <Route path="bom-setup" element={<PackingDepartmentHub />} />
    <Route path="bom/:id" element={<BomManagement />} />
    <Route path="routings" element={<RoutingManagement />} />
    <Route path="routings/:id" element={<RoutingManagement />} />
    <Route path="targets" element={<TargetManagement />} />
    <Route path="targets/:id" element={<TargetManagement />} />
    <Route path="traceability" element={<Traceability />} />
    <Route path="inventory-report" element={<ProductionInventoryReport />} />
    <Route path="machines" element={<Navigate to="/master-data/machines" replace />} />
    <Route path="machines/:machineId" element={<MachineMasterDeepLink />} />
    <Route path="*" element={<Navigate to="/production/dashboard" replace />} />
  </Routes>
);

export default Production;
