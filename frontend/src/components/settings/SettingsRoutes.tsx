import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Settings from '../../pages/settings';
import SettingsShell from './SettingsShell';
import SettingsPlaceholder from './SettingsPlaceholder';
import CompanySettings from './CompanySettings';
import InvoiceSettings from './InvoiceSettings';
import PaymentDetails from './PaymentDetails';
import RemindersAlerts from './RemindersAlerts';
import WhatsAppSettings from './WhatsAppSettings';
import InventoryOptionsSettings from './InventoryOptionsSettings';
import DocumentOptionsSettings from './DocumentOptionsSettings';
import DocumentNumberingSettings from './DocumentNumberingSettings';
import { SETTINGS_NAV_ITEMS, settingsRelativePath } from './settingsNavigationConfig';
import './settings.css';

/**
 * The `/settings/*` route hierarchy.
 *
 * Mounted by `App.tsx` as `<Route path="/settings/*" element={<SettingsRoutes />} />`,
 * exactly like the existing nested routers in this project
 * (`/production/*` → `Production.tsx`, `/products/*` → `Products.tsx`).
 */
const SettingsRoutes: React.FC = () => (
  <SettingsShell>
    <Routes>
      {/* `/settings` — overview keeps the pre-existing Theme Studio + Audio page. */}
      <Route index element={<Settings />} />

      {/* `/settings/company` — Company Settings (Business identity, currency, logo) */}
      <Route path="company" element={<CompanySettings />} />
      <Route path="profile-branding" element={<CompanySettings />} />

      {/* `/settings/invoice` — real Invoice Settings module */}
      <Route path="invoice" element={<InvoiceSettings />} />

      {/* `/settings/payment-details` — real Payment Details module */}
      <Route path="payment-details" element={<PaymentDetails />} />

      {/* `/settings/reminders-alerts` — real Reminders & Alerts module */}
      <Route path="reminders-alerts" element={<RemindersAlerts />} />

      {/* `/settings/whatsapp` — real WhatsApp Messages module */}
      <Route path="whatsapp" element={<WhatsAppSettings />} />

      {/* `/settings/inventory` — real Inventory Options module */}
      <Route path="inventory" element={<InventoryOptionsSettings />} />

      {/* `/settings/document-options` — real Document Options module */}
      <Route path="document-options" element={<DocumentOptionsSettings />} />

      {/* `/settings/document-numbering` — real Document Numbering module */}
      <Route path="document-numbering" element={<DocumentNumberingSettings />} />

      {/* One generated route per remaining category in the canonical registry. */}
      {SETTINGS_NAV_ITEMS.filter((item) =>
        !item.overview &&
        item.id !== 'profile-branding' &&
        item.id !== 'invoice' &&
        item.id !== 'payment-details' &&
        item.id !== 'reminders-alerts' &&
        item.id !== 'whatsapp' &&
        item.id !== 'inventory' &&
        item.id !== 'document-options' &&
        item.id !== 'document-numbering'
      ).map((item) => (
        <Route
          key={item.id}
          path={settingsRelativePath(item)}
          element={<SettingsPlaceholder item={item} />}
        />
      ))}

      {/* Unknown slug under /settings → back to the overview. */}
      <Route path="*" element={<Navigate to="/settings" replace />} />
    </Routes>
  </SettingsShell>
);

export default SettingsRoutes;
