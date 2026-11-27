import { MigrationInterface, QueryRunner } from 'typeorm';

interface PermissionSeed {
  code: string;
  name: string;
  module: string;
  resource: string;
  action: string;
  description: string;
}

export class EnterpriseRbacParityUpgrade1819000000000 implements MigrationInterface {
  name = 'EnterpriseRbacParityUpgrade1819000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Split finance::report into 6 standalone report resources (preserving IDs & role_permissions)
    const financeReportSplits: Array<[string, string, string]> = [
      ['finance.report.trial_balance', 'report_trial_balance', 'View Trial Balance'],
      ['finance.report.general_ledger', 'report_general_ledger', 'View General Ledger'],
      ['finance.report.pl', 'report_pl', 'View Profit & Loss (P&L) Statement'],
      ['finance.report.balance_sheet', 'report_balance_sheet', 'View Balance Sheet'],
      ['finance.report.ar', 'report_ar', 'View AR Aging Report'],
      ['finance.report.ap', 'report_ap', 'View AP Aging Report'],
    ];
    for (const [code, resource, name] of financeReportSplits) {
      await queryRunner.query(
        `UPDATE public.permissions SET resource = $1, name = $2, action = 'VIEW', updated_at = NOW() WHERE permission_code = $3`,
        [resource, name, code],
      );
    }

    // Deactivate unused generic finance.report.{create,update,delete} and duplicate store::report rows
    await queryRunner.query(`
      UPDATE public.permissions
      SET status = 'INACTIVE', is_active = false, updated_at = NOW()
      WHERE permission_code IN (
        'finance.report.create',
        'finance.report.update',
        'finance.report.delete',
        'store.report.view',
        'store.report.create',
        'store.report.update',
        'store.report.delete'
      )
    `);

    // 2. Split manufacturing::machine_tool_component into component_change & tool_component
    await queryRunner.query(`
      UPDATE public.permissions
      SET resource = 'component_change', action = UPPER(action), updated_at = NOW()
      WHERE module = 'manufacturing' AND permission_code LIKE 'manufacturing.component_change.%'
    `);
    await queryRunner.query(`
      UPDATE public.permissions
      SET resource = 'tool_component', action = UPPER(action), updated_at = NOW()
      WHERE module = 'manufacturing'
        AND (permission_code LIKE 'manufacturing.tool_component.%' OR permission_code = 'manufacturing.tool_consumption.report')
    `);

    // 3. Split Receiving & Return Report out of Daily Raw Material Receiving into its own resource
    await queryRunner.query(`
      UPDATE public.permissions
      SET resource = 'receiving-report', action = 'REPORT', name = 'View Receiving & Return Report', updated_at = NOW()
      WHERE permission_code = 'manufacturing.material_receiving.report'
    `);

    // Normalize action casing on existing permissions where mixed-case was used (safely avoiding collisions)
    await queryRunner.query(`
      UPDATE public.permissions
      SET action = UPPER(action), updated_at = NOW()
      WHERE action <> UPPER(action)
    `);

    // 4. Upsert all new standalone resources and granular action controls (V, A, E, D, P, X, R)
    const seeds: PermissionSeed[] = [
      // Workspace & Core
      { code: 'workspace.dashboard.view', name: 'View Dashboard', module: 'workspace', resource: 'dashboard', action: 'VIEW', description: 'Access executive factory KPI Dashboard' },
      { code: 'workspace.dashboard.export', name: 'Export Dashboard', module: 'workspace', resource: 'dashboard', action: 'EXPORT', description: 'Export dashboard summaries and metrics' },
      { code: 'workspace.dashboard.print', name: 'Print Dashboard', module: 'workspace', resource: 'dashboard', action: 'PRINT', description: 'Print dashboard KPI views' },
      { code: 'workspace.team_chat.view', name: 'View Team Chat', module: 'workspace', resource: 'team_chat', action: 'VIEW', description: 'Open Team Chat conversations and messages' },
      { code: 'workspace.team_chat.create', name: 'Send Team Chat Messages', module: 'workspace', resource: 'team_chat', action: 'CREATE', description: 'Create direct/group chats and send messages' },
      { code: 'workspace.reports.view', name: 'View General Reports', module: 'workspace', resource: 'reports', action: 'VIEW', description: 'Access multi-stage production and general reports workspace' },
      { code: 'workspace.reports.export', name: 'Export General Reports', module: 'workspace', resource: 'reports', action: 'EXPORT', description: 'Export general reports to Excel/CSV' },
      { code: 'workspace.reports.print', name: 'Print General Reports', module: 'workspace', resource: 'reports', action: 'PRINT', description: 'Print or generate PDFs from general reports' },
      { code: 'workspace.development.view', name: 'View Development Status', module: 'workspace', resource: 'development', action: 'VIEW', description: 'Access system development status page' },

      // AI Assistant & AI Settings
      { code: 'ai.assistant.view', name: 'View AI Assistant', module: 'ai', resource: 'assistant', action: 'VIEW', description: 'Open AI Assistant workspace' },
      { code: 'ai.assistant.export', name: 'Export AI Assistant Reports', module: 'ai', resource: 'assistant', action: 'EXPORT', description: 'Export AI Assistant query tables to PDF or Excel' },
      { code: 'ai.assistant.print', name: 'Print AI Assistant Reports', module: 'ai', resource: 'assistant', action: 'PRINT', description: 'Print AI Assistant generated insights' },
      { code: 'ai.settings.view', name: 'View AI Settings', module: 'ai', resource: 'settings', action: 'VIEW', description: 'View configured BYOK AI providers' },
      { code: 'ai.settings.create', name: 'Add AI Provider Config', module: 'ai', resource: 'settings', action: 'CREATE', description: 'Create new AI provider profile' },
      { code: 'ai.settings.update', name: 'Edit AI Settings', module: 'ai', resource: 'settings', action: 'UPDATE', description: 'Edit AI provider configuration or set primary engine' },
      { code: 'ai.settings.delete', name: 'Delete AI Provider Config', module: 'ai', resource: 'settings', action: 'DELETE', description: 'Remove an AI provider profile' },

      // System Settings (24 standalone sub-pages matching Settings Sidebar 1-to-1)
      { code: 'settings.overview.view', name: 'View System Overview', module: 'settings', resource: 'overview', action: 'VIEW', description: 'Access System Settings landing overview & Theme Studio' },
      { code: 'settings.appearance.view', name: 'View Appearance Settings', module: 'settings', resource: 'appearance', action: 'VIEW', description: 'Access Appearance theme settings' },
      { code: 'settings.appearance.update', name: 'Edit Appearance Settings', module: 'settings', resource: 'appearance', action: 'UPDATE', description: 'Modify theme mode, accent palette and glass settings' },
      { code: 'settings.profile_branding.view', name: 'View Company Profile', module: 'settings', resource: 'profile_branding', action: 'VIEW', description: 'View company profile, branding and identity settings' },
      { code: 'settings.profile_branding.update', name: 'Edit Company Profile', module: 'settings', resource: 'profile_branding', action: 'UPDATE', description: 'Modify company profile, branding and logo' },
      { code: 'settings.invoice.view', name: 'View Invoice Settings', module: 'settings', resource: 'invoice', action: 'VIEW', description: 'View invoice layout and billing configuration' },
      { code: 'settings.invoice.update', name: 'Edit Invoice Settings', module: 'settings', resource: 'invoice', action: 'UPDATE', description: 'Modify invoice configuration' },
      { code: 'settings.payment_details.view', name: 'View Payment Details', module: 'settings', resource: 'payment_details', action: 'VIEW', description: 'View company bank accounts and payment details' },
      { code: 'settings.payment_details.update', name: 'Edit Payment Details', module: 'settings', resource: 'payment_details', action: 'UPDATE', description: 'Modify company bank accounts and payment instructions' },
      { code: 'settings.reminders_alerts.view', name: 'View Reminders & Alerts', module: 'settings', resource: 'reminders_alerts', action: 'VIEW', description: 'View due date and escalation alert settings' },
      { code: 'settings.reminders_alerts.update', name: 'Edit Reminders & Alerts', module: 'settings', resource: 'reminders_alerts', action: 'UPDATE', description: 'Modify reminder and alert thresholds' },
      { code: 'settings.whatsapp.view', name: 'View WhatsApp Messages', module: 'settings', resource: 'whatsapp', action: 'VIEW', description: 'View WhatsApp Messages system configuration' },
      { code: 'settings.whatsapp.update', name: 'Edit WhatsApp Messages', module: 'settings', resource: 'whatsapp', action: 'UPDATE', description: 'Configure WhatsApp sender templates and defaults' },
      { code: 'settings.inventory.view', name: 'View Inventory Options', module: 'settings', resource: 'inventory', action: 'VIEW', description: 'View inventory costing and reservation defaults' },
      { code: 'settings.inventory.update', name: 'Edit Inventory Options', module: 'settings', resource: 'inventory', action: 'UPDATE', description: 'Modify inventory system options' },
      { code: 'settings.document_options.view', name: 'View Document Options', module: 'settings', resource: 'document_options', action: 'VIEW', description: 'View document shared defaults' },
      { code: 'settings.document_options.update', name: 'Edit Document Options', module: 'settings', resource: 'document_options', action: 'UPDATE', description: 'Modify document options' },
      { code: 'settings.edit_lock.view', name: 'View Edit Lock', module: 'settings', resource: 'edit_lock', action: 'VIEW', description: 'View document edit-lock rules' },
      { code: 'settings.edit_lock.update', name: 'Edit Edit Lock', module: 'settings', resource: 'edit_lock', action: 'UPDATE', description: 'Configure edit-lock cutoff dates' },
      { code: 'settings.late_fees.view', name: 'View Late Fees', module: 'settings', resource: 'late_fees', action: 'VIEW', description: 'View late fee calculation settings' },
      { code: 'settings.late_fees.update', name: 'Edit Late Fees', module: 'settings', resource: 'late_fees', action: 'UPDATE', description: 'Modify late fee rules' },
      { code: 'settings.loyalty.view', name: 'View Loyalty Points', module: 'settings', resource: 'loyalty', action: 'VIEW', description: 'View loyalty points rules' },
      { code: 'settings.loyalty.update', name: 'Edit Loyalty Points', module: 'settings', resource: 'loyalty', action: 'UPDATE', description: 'Modify loyalty points configuration' },
      { code: 'settings.document_numbering.view', name: 'View Document Numbering', module: 'settings', resource: 'document_numbering', action: 'VIEW', description: 'View ERP document numbering series' },
      { code: 'settings.document_numbering.update', name: 'Edit Document Numbering', module: 'settings', resource: 'document_numbering', action: 'UPDATE', description: 'Modify ERP document numbering series' },
      { code: 'settings.tax.view', name: 'View Tax Settings', module: 'settings', resource: 'tax', action: 'VIEW', description: 'View tax codes and rate settings' },
      { code: 'settings.tax.update', name: 'Edit Tax Settings', module: 'settings', resource: 'tax', action: 'UPDATE', description: 'Modify tax rates and rules' },
      { code: 'settings.currency.view', name: 'View Currency & Exchange', module: 'settings', resource: 'currency', action: 'VIEW', description: 'View base currency and exchange settings' },
      { code: 'settings.currency.update', name: 'Edit Currency & Exchange', module: 'settings', resource: 'currency', action: 'UPDATE', description: 'Modify currency and rounding rules' },
      { code: 'settings.payment_terms.view', name: 'View Payment Terms', module: 'settings', resource: 'payment_terms', action: 'VIEW', description: 'View standard payment terms' },
      { code: 'settings.payment_terms.update', name: 'Edit Payment Terms', module: 'settings', resource: 'payment_terms', action: 'UPDATE', description: 'Modify standard payment terms' },
      { code: 'settings.organization.view', name: 'View Branches / Divisions Settings', module: 'settings', resource: 'organization', action: 'VIEW', description: 'View branch and division scope settings' },
      { code: 'settings.organization.update', name: 'Edit Branches / Divisions Settings', module: 'settings', resource: 'organization', action: 'UPDATE', description: 'Modify branch and division scope configuration' },
      { code: 'settings.print_templates.view', name: 'View Print & PDF Templates', module: 'settings', resource: 'print_templates', action: 'VIEW', description: 'View print and PDF layout templates' },
      { code: 'settings.print_templates.update', name: 'Edit Print & PDF Templates', module: 'settings', resource: 'print_templates', action: 'UPDATE', description: 'Modify print and PDF templates' },
      { code: 'settings.email.view', name: 'View System Email Settings', module: 'settings', resource: 'email', action: 'VIEW', description: 'View SMTP system email settings' },
      { code: 'settings.email.update', name: 'Edit System Email Settings', module: 'settings', resource: 'email', action: 'UPDATE', description: 'Modify SMTP email settings' },
      { code: 'settings.notifications.view', name: 'View Notification Settings', module: 'settings', resource: 'notifications', action: 'VIEW', description: 'View system notification rules and preferences' },
      { code: 'settings.notifications.update', name: 'Edit Notification Settings', module: 'settings', resource: 'notifications', action: 'UPDATE', description: 'Modify system notification settings' },
      { code: 'settings.security.view', name: 'View Security & Access', module: 'settings', resource: 'security', action: 'VIEW', description: 'View security and session policy settings' },
      { code: 'settings.security.update', name: 'Edit Security & Access', module: 'settings', resource: 'security', action: 'UPDATE', description: 'Modify security and session access policies' },
      { code: 'settings.audit.view', name: 'View Audit & Change History', module: 'settings', resource: 'audit', action: 'VIEW', description: 'View system configuration audit history' },
      { code: 'settings.audit.export', name: 'Export Audit & Change History', module: 'settings', resource: 'audit', action: 'EXPORT', description: 'Export system configuration audit trail' },
      { code: 'settings.data_tools.view', name: 'View Backup / Data Tools', module: 'settings', resource: 'data_tools', action: 'VIEW', description: 'Access backup and data maintenance utilities' },
      { code: 'settings.data_tools.update', name: 'Manage Backup / Data Tools', module: 'settings', resource: 'data_tools', action: 'UPDATE', description: 'Execute backup or maintenance utilities' },
      { code: 'settings.data_tools.export', name: 'Export Backup Data', module: 'settings', resource: 'data_tools', action: 'EXPORT', description: 'Download backup exports from Data Tools' },
      { code: 'settings.install_app.view', name: 'View Install App', module: 'settings', resource: 'install_app', action: 'VIEW', description: 'Access ERP desktop/mobile app installation guide' },

      // Organization
      { code: 'organization.warehouse_location.view', name: 'View Warehouse Locations', module: 'organization', resource: 'warehouse_location', action: 'VIEW', description: 'View warehouse rack/bin locations' },
      { code: 'organization.warehouse_location.create', name: 'Create Warehouse Location', module: 'organization', resource: 'warehouse_location', action: 'CREATE', description: 'Create warehouse locations' },
      { code: 'organization.warehouse_location.update', name: 'Update Warehouse Location', module: 'organization', resource: 'warehouse_location', action: 'UPDATE', description: 'Edit warehouse locations' },
      { code: 'organization.warehouse_location.activate', name: 'Activate Warehouse Location', module: 'organization', resource: 'warehouse_location', action: 'ACTIVATE', description: 'Activate warehouse locations' },
      { code: 'organization.warehouse_location.deactivate', name: 'Deactivate Warehouse Location', module: 'organization', resource: 'warehouse_location', action: 'DEACTIVATE', description: 'Deactivate warehouse locations' },
      { code: 'organization.warehouse_location.delete', name: 'Delete Warehouse Location', module: 'organization', resource: 'warehouse_location', action: 'DELETE', description: 'Delete warehouse locations' },

      // Administration
      { code: 'admin.matrix.view', name: 'View Roles & Permissions Matrix', module: 'admin', resource: 'permission_matrix', action: 'VIEW', description: 'Access Roles & Permissions Matrix grid' },
      { code: 'admin.matrix.update', name: 'Update Roles & Permissions Matrix', module: 'admin', resource: 'permission_matrix', action: 'UPDATE', description: 'Modify role permission toggles & division scopes in Matrix' },
      { code: 'admin.matrix.export', name: 'Export Roles & Permissions Matrix', module: 'admin', resource: 'permission_matrix', action: 'EXPORT', description: 'Export Roles & Permissions Matrix to CSV/PDF' },
      { code: 'admin.recycle_bin.view', name: 'View Recycle Bin', module: 'admin', resource: 'recycle_bin', action: 'VIEW', description: 'View soft-deleted ERP records in Recycle Bin' },
      { code: 'admin.recycle_bin.restore', name: 'Restore Recycle Bin Records', module: 'admin', resource: 'recycle_bin', action: 'REVERSE', description: 'Restore deleted records back to live grids' },
      { code: 'admin.recycle_bin.purge', name: 'Purge Recycle Bin Records', module: 'admin', resource: 'recycle_bin', action: 'DELETE', description: 'Permanently delete soft-deleted records from Recycle Bin' },

      // Customers & Analytics
      { code: 'customer.customer.export', name: 'Export Customer List', module: 'customer', resource: 'customer', action: 'EXPORT', description: 'Export customers CSV/Excel' },
      { code: 'customer.customer.print', name: 'Print Customer List', module: 'customer', resource: 'customer', action: 'PRINT', description: 'Print customer directory or cards' },
      { code: 'customer.analytics.view', name: 'View Customer Analytics', module: 'customer', resource: 'analytics', action: 'VIEW', description: 'Access Customer Analytics dashboard and rankings' },
      { code: 'customer.analytics.export', name: 'Export Customer Analytics', module: 'customer', resource: 'analytics', action: 'EXPORT', description: 'Export Customer Analytics reports' },
      { code: 'customer.analytics.print', name: 'Print Customer Analytics', module: 'customer', resource: 'analytics', action: 'PRINT', description: 'Print Customer Analytics views' },

      // Sales Standalone Rows & Granular Controls
      { code: 'sales.analytics.view', name: 'View Sales Intelligence', module: 'sales', resource: 'analytics', action: 'VIEW', description: 'Access Sales Intelligence KPIs & demand dashboards' },
      { code: 'sales.analytics.update', name: 'Edit Sales Planning Config', module: 'sales', resource: 'analytics', action: 'UPDATE', description: 'Configure Sales & Nipple planning overrides' },
      { code: 'sales.analytics.export', name: 'Export Sales Intelligence', module: 'sales', resource: 'analytics', action: 'EXPORT', description: 'Export Sales Intelligence data' },
      { code: 'sales.analytics.print', name: 'Print Sales Intelligence', module: 'sales', resource: 'analytics', action: 'PRINT', description: 'Print Sales Intelligence summaries' },
      { code: 'sales.finished_goods.view', name: 'View Finished Goods Inventory', module: 'sales', resource: 'finished_goods', action: 'VIEW', description: 'Access Sales Finished Goods Inventory intelligence' },
      { code: 'sales.finished_goods.update', name: 'Update Packing Hold Status', module: 'sales', resource: 'finished_goods', action: 'UPDATE', description: 'Update polybag / packing hold status on finished goods' },
      { code: 'sales.finished_goods.export', name: 'Export Finished Goods Inventory', module: 'sales', resource: 'finished_goods', action: 'EXPORT', description: 'Export Finished Goods availability table' },
      { code: 'sales.finished_goods.print', name: 'Print Finished Goods Inventory', module: 'sales', resource: 'finished_goods', action: 'PRINT', description: 'Print Finished Goods availability report' },
      { code: 'sales.order_command.view', name: 'View Order Command & Fulfillment', module: 'sales', resource: 'order_command', action: 'VIEW', description: 'Access Order Command & Fulfillment cockpit' },
      { code: 'sales.order_command.export', name: 'Export Order Command', module: 'sales', resource: 'order_command', action: 'EXPORT', description: 'Export Order Command fulfillment schedule' },
      { code: 'sales.order_command.print', name: 'Print Order Command', module: 'sales', resource: 'order_command', action: 'PRINT', description: 'Print Order Command sheets' },
      { code: 'sales.division_review.view', name: 'View Order Division Review', module: 'sales', resource: 'division_review', action: 'VIEW', description: 'Access Sales Order Division Review screen' },
      { code: 'sales.division_review.export', name: 'Export Order Division Review', module: 'sales', resource: 'division_review', action: 'EXPORT', description: 'Export Order Division Review reports' },
      { code: 'sales.orders.revert_delivery', name: 'Revert Delivered Sales Order', module: 'sales', resource: 'orders', action: 'REVERSE', description: 'Undo premature Delivered/Shipped status on a Sales Order' },
      { code: 'sales.orders.export', name: 'Export Sales Orders', module: 'sales', resource: 'orders', action: 'EXPORT', description: 'Export Sales Orders to CSV/Excel' },
      { code: 'sales.orders.print', name: 'Print Sales Orders', module: 'sales', resource: 'orders', action: 'PRINT', description: 'Print Sales Order documents' },
      { code: 'sales.quotations.export', name: 'Export Sales Quotations', module: 'sales', resource: 'quotations', action: 'EXPORT', description: 'Export Sales Quotations' },
      { code: 'sales.quotations.print', name: 'Print Sales Quotations', module: 'sales', resource: 'quotations', action: 'PRINT', description: 'Print Sales Quotations' },
      { code: 'sales.deliveries.export', name: 'Export Deliveries', module: 'sales', resource: 'deliveries', action: 'EXPORT', description: 'Export Sales Deliveries' },
      { code: 'sales.deliveries.print', name: 'Print Outward Gate Passes', module: 'sales', resource: 'deliveries', action: 'PRINT', description: 'Print Outward Gate Passes and Delivery Notes' },
      { code: 'sales.dispatch_packages.view', name: 'View Dispatch Packages', module: 'sales', resource: 'dispatch_packages', action: 'VIEW', description: 'View dispatch packages and traceability scans' },
      { code: 'sales.dispatch_packages.create', name: 'Create Dispatch Packages', module: 'sales', resource: 'dispatch_packages', action: 'CREATE', description: 'Create dispatch packages and scan units into packages' },
      { code: 'sales.dispatch_packages.update', name: 'Edit Dispatch Packages', module: 'sales', resource: 'dispatch_packages', action: 'UPDATE', description: 'Modify open packages, link gate passes, or cancel packages' },
      { code: 'sales.dispatch_packages.delete', name: 'Delete Dispatch Packages', module: 'sales', resource: 'dispatch_packages', action: 'DELETE', description: 'Move dispatch packages to Recycle Bin or remove units' },
      { code: 'sales.dispatch_packages.post', name: 'Finalize / Gate-Exit Dispatch Packages', module: 'sales', resource: 'dispatch_packages', action: 'POST', description: 'Finalize dispatch package or authorize factory gate exit' },
      { code: 'sales.dispatch_packages.print', name: 'Print Dispatch Package Labels', module: 'sales', resource: 'dispatch_packages', action: 'PRINT', description: 'Print dispatch package manifests and labels' },
      { code: 'sales.invoices.export', name: 'Export Sales Invoices', module: 'sales', resource: 'invoices', action: 'EXPORT', description: 'Export Sales Invoices' },
      { code: 'sales.invoices.print', name: 'Print Formal Sales Invoices', module: 'sales', resource: 'invoices', action: 'PRINT', description: 'Print formal tax/sales invoices' },
      { code: 'sales.receipts.view', name: 'View Customer Payments', module: 'sales', resource: 'receipts', action: 'VIEW', description: 'View customer receipts, advances, and aging' },
      { code: 'sales.receipts.create', name: 'Create Customer Payment Receipt', module: 'sales', resource: 'receipts', action: 'CREATE', description: 'Record customer payment receipts' },
      { code: 'sales.receipts.post', name: 'Post / Apply Customer Receipt', module: 'sales', resource: 'receipts', action: 'POST', description: 'Post customer payment receipts or apply customer advances' },
      { code: 'sales.receipts.approve', name: 'Clear / Bounce Customer Cheque', module: 'sales', resource: 'receipts', action: 'APPROVE', description: 'Mark customer cheque cleared or bounced' },
      { code: 'sales.receipts.export', name: 'Export Customer Payments', module: 'sales', resource: 'receipts', action: 'EXPORT', description: 'Export Customer Payments ledger' },
      { code: 'sales.receipts.print', name: 'Print Customer Payment Receipt', module: 'sales', resource: 'receipts', action: 'PRINT', description: 'Print customer payment vouchers/receipts' },
      { code: 'sales.customers_ledger.view', name: 'View Customers & Ledger', module: 'sales', resource: 'customers_ledger', action: 'VIEW', description: 'View Customers & Receivables Ledger' },
      { code: 'sales.customers_ledger.export', name: 'Export Customers & Ledger', module: 'sales', resource: 'customers_ledger', action: 'EXPORT', description: 'Export customer ledger statements' },
      { code: 'sales.customers_ledger.print', name: 'Print Customers & Ledger', module: 'sales', resource: 'customers_ledger', action: 'PRINT', description: 'Print official customer ledger statements' },
      { code: 'sales.returns.export', name: 'Export Sales Returns', module: 'sales', resource: 'returns', action: 'EXPORT', description: 'Export Sales Returns' },
      { code: 'sales.returns.print', name: 'Print Sales Returns', module: 'sales', resource: 'returns', action: 'PRINT', description: 'Print Sales Returns / Credit Notes' },

      // Finance Split Reports + Export/Print
      { code: 'finance.report.cash_bank_book', name: 'View Cash & Bank Book', module: 'finance', resource: 'report_cash_bank', action: 'VIEW', description: 'Access Finance Cash & Bank Book ledger' },
      { code: 'finance.report.cash_bank_book.export', name: 'Export Cash & Bank Book', module: 'finance', resource: 'report_cash_bank', action: 'EXPORT', description: 'Export Cash & Bank Book' },
      { code: 'finance.report.cash_bank_book.print', name: 'Print Cash & Bank Book', module: 'finance', resource: 'report_cash_bank', action: 'PRINT', description: 'Print Cash & Bank Book' },
      { code: 'finance.report.trial_balance.export', name: 'Export Trial Balance', module: 'finance', resource: 'report_trial_balance', action: 'EXPORT', description: 'Export Trial Balance report' },
      { code: 'finance.report.trial_balance.print', name: 'Print Trial Balance', module: 'finance', resource: 'report_trial_balance', action: 'PRINT', description: 'Print Trial Balance report' },
      { code: 'finance.report.general_ledger.export', name: 'Export General Ledger', module: 'finance', resource: 'report_general_ledger', action: 'EXPORT', description: 'Export General Ledger report' },
      { code: 'finance.report.general_ledger.print', name: 'Print General Ledger', module: 'finance', resource: 'report_general_ledger', action: 'PRINT', description: 'Print General Ledger report' },
      { code: 'finance.report.pl.export', name: 'Export Profit & Loss Statement', module: 'finance', resource: 'report_pl', action: 'EXPORT', description: 'Export Profit & Loss (P&L) Statement' },
      { code: 'finance.report.pl.print', name: 'Print Profit & Loss Statement', module: 'finance', resource: 'report_pl', action: 'PRINT', description: 'Print Profit & Loss (P&L) Statement' },
      { code: 'finance.report.balance_sheet.export', name: 'Export Balance Sheet', module: 'finance', resource: 'report_balance_sheet', action: 'EXPORT', description: 'Export Balance Sheet' },
      { code: 'finance.report.balance_sheet.print', name: 'Print Balance Sheet', module: 'finance', resource: 'report_balance_sheet', action: 'PRINT', description: 'Print Balance Sheet' },
      { code: 'finance.report.ar.export', name: 'Export AR Aging Report', module: 'finance', resource: 'report_ar', action: 'EXPORT', description: 'Export AR Aging Report' },
      { code: 'finance.report.ar.print', name: 'Print AR Aging Report', module: 'finance', resource: 'report_ar', action: 'PRINT', description: 'Print AR Aging Report' },
      { code: 'finance.report.ap.export', name: 'Export AP Aging Report', module: 'finance', resource: 'report_ap', action: 'EXPORT', description: 'Export AP Aging Report' },
      { code: 'finance.report.ap.print', name: 'Print AP Aging Report', module: 'finance', resource: 'report_ap', action: 'PRINT', description: 'Print AP Aging Report' },
      { code: 'finance.account.export', name: 'Export Chart of Accounts', module: 'finance', resource: 'account', action: 'EXPORT', description: 'Export Chart of Accounts' },
      { code: 'finance.journal.export', name: 'Export Vouchers & Journals', module: 'finance', resource: 'journal', action: 'EXPORT', description: 'Export Vouchers & Journals' },
      { code: 'finance.journal.print', name: 'Print Vouchers & Journals', module: 'finance', resource: 'journal', action: 'PRINT', description: 'Print Journal Vouchers' },

      // Inventory
      { code: 'inventory.opening_stock.reverse', name: 'Reverse / Restore Opening Stock Batch', module: 'inventory', resource: 'opening_stock', action: 'REVERSE', description: 'Safely undo, reverse, or restore a posted Opening Stock batch' },
      { code: 'inventory.opening_stock.export', name: 'Export Opening Stock Templates & Batches', module: 'inventory', resource: 'opening_stock', action: 'EXPORT', description: 'Download Opening Stock pre-filled Excel/CSV templates & export history' },
      { code: 'inventory.opening_stock.print', name: 'Print Opening Stock Batches', module: 'inventory', resource: 'opening_stock', action: 'PRINT', description: 'Print Opening Stock batch reports' },
      { code: 'inventory.ledger.view', name: 'View Stock Ledger', module: 'inventory', resource: 'ledger', action: 'VIEW', description: 'View Inventory Stock Ledger transactions' },
      { code: 'inventory.ledger.export', name: 'Export Stock Ledger', module: 'inventory', resource: 'ledger', action: 'EXPORT', description: 'Export Stock Ledger entries' },
      { code: 'inventory.ledger.print', name: 'Print Stock Ledger', module: 'inventory', resource: 'ledger', action: 'PRINT', description: 'Print Stock Ledger reports' },
      { code: 'inventory.nipple_demand.view', name: 'View Nipple Demand & Balance', module: 'inventory', resource: 'nipple_demand', action: 'VIEW', description: 'View Nipple Import Demand & Safety Balance planner' },
      { code: 'inventory.nipple_demand.update', name: 'Edit Nipple Planning Overrides', module: 'inventory', resource: 'nipple_demand', action: 'UPDATE', description: 'Update Nipple monthly usage overrides & lead times' },
      { code: 'inventory.nipple_demand.export', name: 'Export Nipple Demand Matrix', module: 'inventory', resource: 'nipple_demand', action: 'EXPORT', description: 'Export Nipple shipment & demand projections' },
      { code: 'inventory.reports.export', name: 'Export Inventory Reports', module: 'inventory', resource: 'reports', action: 'EXPORT', description: 'Export Inventory balance & valuation reports' },
      { code: 'inventory.reports.print', name: 'Print Inventory Reports', module: 'inventory', resource: 'reports', action: 'PRINT', description: 'Print Inventory reports' },

      // Manufacturing / Production Department
      { code: 'manufacturing.dashboard.view', name: 'View Production Dashboard', module: 'manufacturing', resource: 'production-dashboard', action: 'VIEW', description: 'Access Production Department Dashboard' },
      { code: 'manufacturing.open_stock.view', name: 'View Production Item Open Stock', module: 'manufacturing', resource: 'production-open-stock', action: 'VIEW', description: 'View shopfloor opening stock balances & batches' },
      { code: 'manufacturing.open_stock.create', name: 'Post Production Item Open Stock', module: 'manufacturing', resource: 'production-open-stock', action: 'CREATE', description: 'Create production item opening stock entries' },
      { code: 'manufacturing.open_stock.update', name: 'Edit Production Item Open Stock', module: 'manufacturing', resource: 'production-open-stock', action: 'UPDATE', description: 'Edit production open stock entries' },
      { code: 'manufacturing.open_stock.delete', name: 'Delete Production Item Open Stock', module: 'manufacturing', resource: 'production-open-stock', action: 'DELETE', description: 'Delete or reverse production open stock entries' },
      { code: 'manufacturing.packing.view', name: 'View Daily Packing Entry', module: 'manufacturing', resource: 'packing', action: 'VIEW', description: 'Access Daily Packing Entry & Packing Hub' },
      { code: 'manufacturing.packing.create', name: 'Create Daily Packing Entry', module: 'manufacturing', resource: 'packing', action: 'CREATE', description: 'Record Daily Hand Packing entries & shift setups' },
      { code: 'manufacturing.packing.update', name: 'Edit Daily Packing Entry', module: 'manufacturing', resource: 'packing', action: 'UPDATE', description: 'Update Daily Packing entries & nipple completions' },
      { code: 'manufacturing.packing.delete', name: 'Delete Daily Packing Entry', module: 'manufacturing', resource: 'packing', action: 'DELETE', description: 'Delete Daily Packing entries' },
      { code: 'manufacturing.packing.print', name: 'Print Packing Reports', module: 'manufacturing', resource: 'packing', action: 'PRINT', description: 'Print or share Daily Packing summaries' },
      { code: 'manufacturing.rework_return.view', name: 'View Production Rework & Return', module: 'manufacturing', resource: 'rework-return', action: 'VIEW', description: 'View inter-department production rework returns' },
      { code: 'manufacturing.rework_return.create', name: 'Create Production Rework & Return', module: 'manufacturing', resource: 'rework-return', action: 'CREATE', description: 'Create inter-department rework returns & lookup options' },
      { code: 'manufacturing.rework_return.update', name: 'Edit Production Rework & Return', module: 'manufacturing', resource: 'rework-return', action: 'UPDATE', description: 'Edit production rework returns' },
      { code: 'manufacturing.rework_return.approve', name: 'Approve / Transition Production Rework Return', module: 'manufacturing', resource: 'rework-return', action: 'APPROVE', description: 'Update status or approve production rework returns' },
      { code: 'manufacturing.rework_return.delete', name: 'Delete Production Rework & Return', module: 'manufacturing', resource: 'rework-return', action: 'DELETE', description: 'Delete production rework returns' },
      { code: 'manufacturing.units.view', name: 'View Unit Serialization & Labels', module: 'manufacturing', resource: 'units', action: 'VIEW', description: 'View serialized coil/unit labels & print history' },
      { code: 'manufacturing.units.create', name: 'Generate Serialized Units', module: 'manufacturing', resource: 'units', action: 'CREATE', description: 'Generate QR/barcode production unit serials' },
      { code: 'manufacturing.units.update', name: 'Update / Bulk Weight Serialized Units', module: 'manufacturing', resource: 'units', action: 'UPDATE', description: 'Update serialized unit weights or void units' },
      { code: 'manufacturing.units.delete', name: 'Delete / Void Serialized Units', module: 'manufacturing', resource: 'units', action: 'DELETE', description: 'Void serialized production units' },
      { code: 'manufacturing.units.print', name: 'Print Unit Labels', module: 'manufacturing', resource: 'units', action: 'PRINT', description: 'Print or reprint serialized production unit labels' },
      { code: 'manufacturing.traceability.view', name: 'View Traceability', module: 'manufacturing', resource: 'traceability', action: 'VIEW', description: 'Access WIP & Department-Wise Production Traceability' },
      { code: 'manufacturing.traceability.export', name: 'Export Traceability', module: 'manufacturing', resource: 'traceability', action: 'EXPORT', description: 'Export traceability statements' },
      { code: 'manufacturing.traceability.print', name: 'Print Traceability', module: 'manufacturing', resource: 'traceability', action: 'PRINT', description: 'Print traceability reports' },
      { code: 'manufacturing.inventory_report.view', name: 'View Production Inventory Report', module: 'manufacturing', resource: 'inventory-report', action: 'VIEW', description: 'Access Production Inventory Report' },
      { code: 'manufacturing.inventory_report.export', name: 'Export Production Inventory Report', module: 'manufacturing', resource: 'inventory-report', action: 'EXPORT', description: 'Export Production Inventory Report' },
      { code: 'manufacturing.inventory_report.print', name: 'Print Production Inventory Report', module: 'manufacturing', resource: 'inventory-report', action: 'PRINT', description: 'Print Production Inventory Report' },
      { code: 'manufacturing.item_wise_ledger.view', name: 'View Item-Wise Production Ledger', module: 'manufacturing', resource: 'item-wise-ledger', action: 'VIEW', description: 'Access Item-Wise Production Ledger multi-stage view' },
      { code: 'manufacturing.item_wise_ledger.export', name: 'Export Item-Wise Production Ledger', module: 'manufacturing', resource: 'item-wise-ledger', action: 'EXPORT', description: 'Export Item-Wise Production Ledger to Excel/CSV' },
      { code: 'manufacturing.item_wise_ledger.print', name: 'Print Item-Wise Production Ledger', module: 'manufacturing', resource: 'item-wise-ledger', action: 'PRINT', description: 'Print Item-Wise Production Ledger PDFs' },
      { code: 'manufacturing.production.entries.export', name: 'Export Daily Production Entries', module: 'manufacturing', resource: 'production-entries', action: 'EXPORT', description: 'Export Daily Production Entries to Excel/CSV' },
      { code: 'manufacturing.production.entries.print', name: 'Print Daily Production Entries', module: 'manufacturing', resource: 'production-entries', action: 'PRINT', description: 'Print Daily Production Entry reports' },
      { code: 'manufacturing.production.reports.export', name: 'Export Production Reports', module: 'manufacturing', resource: 'production-reports', action: 'EXPORT', description: 'Export Production Reports' },
      { code: 'manufacturing.production.reports.print', name: 'Print Production Reports', module: 'manufacturing', resource: 'production-reports', action: 'PRINT', description: 'Print Production Reports' },
      { code: 'manufacturing.material_receiving.export', name: 'Export Raw Material Receiving', module: 'manufacturing', resource: 'material-receiving', action: 'EXPORT', description: 'Export Raw Material Receiving logs' },
      { code: 'manufacturing.material_receiving.print', name: 'Print Raw Material Receiving', module: 'manufacturing', resource: 'material-receiving', action: 'PRINT', description: 'Print Raw Material Receiving PDFs' },
      { code: 'manufacturing.material_receiving.report.export', name: 'Export Receiving & Return Report', module: 'manufacturing', resource: 'receiving-report', action: 'EXPORT', description: 'Export Receiving & Return Report' },
      { code: 'manufacturing.material_receiving.report.print', name: 'Print Receiving & Return Report', module: 'manufacturing', resource: 'receiving-report', action: 'PRINT', description: 'Print Receiving & Return Report' },

      // HR Payroll, Final Settlement, Employee Documents & Export
      { code: 'hr.payroll.view', name: 'View HR Payroll', module: 'hr', resource: 'payroll', action: 'VIEW', description: 'Access HR Payroll computation and salary registers' },
      { code: 'hr.payroll.create', name: 'Create / Run HR Payroll', module: 'hr', resource: 'payroll', action: 'CREATE', description: 'Generate monthly payroll runs' },
      { code: 'hr.payroll.update', name: 'Edit HR Payroll', module: 'hr', resource: 'payroll', action: 'UPDATE', description: 'Adjust payroll deductions or allowances' },
      { code: 'hr.payroll.approve', name: 'Approve / Post HR Payroll', module: 'hr', resource: 'payroll', action: 'APPROVE', description: 'Approve final payroll disbursement' },
      { code: 'hr.payroll.export', name: 'Export HR Payroll', module: 'hr', resource: 'payroll', action: 'EXPORT', description: 'Export payroll bank sheets and payslips' },
      { code: 'hr.final_settlement.view', name: 'View Final Settlement', module: 'hr', resource: 'final_settlement', action: 'VIEW', description: 'Access Employee Final Settlement module' },
      { code: 'hr.final_settlement.create', name: 'Create Final Settlement', module: 'hr', resource: 'final_settlement', action: 'CREATE', description: 'Prepare employee final settlements' },
      { code: 'hr.final_settlement.update', name: 'Edit Final Settlement', module: 'hr', resource: 'final_settlement', action: 'UPDATE', description: 'Update employee final settlement entries' },
      { code: 'hr.final_settlement.approve', name: 'Approve Final Settlement', module: 'hr', resource: 'final_settlement', action: 'APPROVE', description: 'Approve final settlement payouts' },
      { code: 'hr.final_settlement.export', name: 'Export Final Settlement', module: 'hr', resource: 'final_settlement', action: 'EXPORT', description: 'Export final settlement statements' },
      { code: 'hr.employee_documents.view', name: 'View Employee Documents', module: 'hr', resource: 'employee_documents', action: 'VIEW', description: 'View employee document vault' },
      { code: 'hr.employee_documents.create', name: 'Upload Employee Documents', module: 'hr', resource: 'employee_documents', action: 'CREATE', description: 'Upload employee identity and compliance documents' },
      { code: 'hr.employee_documents.delete', name: 'Delete Employee Documents', module: 'hr', resource: 'employee_documents', action: 'DELETE', description: 'Remove employee documents' },
      { code: 'hr.employee.export', name: 'Export Employees', module: 'hr', resource: 'employee', action: 'EXPORT', description: 'Export employee roster to CSV/PDF' },
      { code: 'hr.employee.print', name: 'Print Employees', module: 'hr', resource: 'employee', action: 'PRINT', description: 'Print employee directory or ID cards' },

      // Store & QC Export/Print extras
      { code: 'store.stock_balance.view', name: 'View Store Stock Balance', module: 'store', resource: 'stock_balance', action: 'VIEW', description: 'Access Store Stock Balance summary' },
      { code: 'store.stock_balance.export', name: 'Export Store Stock Balance', module: 'store', resource: 'stock_balance', action: 'EXPORT', description: 'Export Store Stock Balance' },
      { code: 'store.reports.export', name: 'Export Store Reports', module: 'store', resource: 'reports', action: 'EXPORT', description: 'Export Store Reports' },
      { code: 'store.reports.print', name: 'Print Store Reports', module: 'store', resource: 'reports', action: 'PRINT', description: 'Print Store Reports' },
      { code: 'store.issue.print', name: 'Print Store Issue Notes', module: 'store', resource: 'issue', action: 'PRINT', description: 'Print Store Issue Note vouchers' },
      { code: 'qc.inspection.export', name: 'Export QC Inspections', module: 'qc', resource: 'inspection', action: 'EXPORT', description: 'Export QC inspection logs' },
      { code: 'qc.inspection.print', name: 'Print QC Sheets', module: 'qc', resource: 'inspection', action: 'PRINT', description: 'Print QMS printable inspection sheets' },
    ];

    for (let i = 0; i < seeds.length; i += 50) {
      const batch = seeds.slice(i, i + 50);
      const values: any[] = [];
      const placeholders = batch.map((s, idx) => {
        const b = idx * 6;
        values.push(s.code, s.name, s.module, s.resource, s.action, s.description);
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, 'ACTIVE', true)`;
      });
      await queryRunner.query(
        `
          INSERT INTO public.permissions (permission_code, name, module, resource, action, description, status, is_active)
          VALUES ${placeholders.join(', ')}
          ON CONFLICT (permission_code) DO UPDATE
            SET name = EXCLUDED.name,
                module = EXCLUDED.module,
                resource = EXCLUDED.resource,
                action = EXCLUDED.action,
                description = EXCLUDED.description,
                status = 'ACTIVE',
                is_active = true,
                updated_at = NOW()
        `,
        values,
      );
    }

    // 5. Grant ALL active permissions automatically to ADMIN & SUPER_ADMIN ONLY.
    // All other / custom roles start locked-by-default (deny-by-default) on new permissions.
    await queryRunner.query(`
      INSERT INTO public.role_permissions (role_id, permission_id, status, is_active)
      SELECT r.id, p.id, 'ACTIVE', true
      FROM public.roles r
      CROSS JOIN public.permissions p
      WHERE r.role_code IN ('ADMIN', 'SUPER_ADMIN')
        AND r.status = 'ACTIVE'
        AND p.status = 'ACTIVE'
      ON CONFLICT (role_id, permission_id) DO UPDATE
        SET status = 'ACTIVE',
            is_active = true,
            updated_at = NOW()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Non-destructive rollback helper: revert split resource groups back only if needed
    await queryRunner.query(`
      UPDATE public.permissions
      SET resource = 'report', updated_at = NOW()
      WHERE permission_code IN (
        'finance.report.trial_balance',
        'finance.report.general_ledger',
        'finance.report.pl',
        'finance.report.balance_sheet',
        'finance.report.ar',
        'finance.report.ap'
      )
    `);
  }
}
