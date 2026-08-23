import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import EntryList from './entries/EntryList';
import EntryForm from './entries/EntryForm';
import EntryDetail from './entries/EntryDetail';
import EntryMachineSelect from './entries/EntryMachineSelect';

const ProductionEntries: React.FC = () => (
  <Routes>
    <Route index element={<EntryList />} />
    <Route path="select" element={<EntryMachineSelect />} />
    <Route path="new" element={<EntryForm mode="create" />} />
    <Route path=":id" element={<EntryDetail />} />
    <Route path=":id/edit" element={<EntryForm mode="edit" />} />
    <Route path="*" element={<Navigate to="/production/entries" replace />} />
  </Routes>
);

export default ProductionEntries;
