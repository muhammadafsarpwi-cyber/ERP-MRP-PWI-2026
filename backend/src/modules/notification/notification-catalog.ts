/**
 * Enterprise notification event catalog — the single source of truth for
 * every meaningful business event that can generate a notification.
 *
 * The catalog is seeded into `notification_events` (per-company rows) by
 * migration 00038. The `module` groups map 1:1 to the ERP sidebar modules.
 *
 * Events are NOT auto-registered on every CRUD — only meaningful business
 * transitions are listed here (created/approved/started/closed/etc.).
 */

export interface CatalogEvent {
  code: string;
  name: string;
  module: string;
  description: string;
  /** Default recipient audience used by the seeded rule. */
  defaultRecipientType: 'ROLE' | 'DEPARTMENT' | 'USER' | 'CREATOR' | 'ASSIGNEE' | 'APPROVER' | 'MANAGER' | 'COMPANY';
  defaultRecipientRoles: string[];
}

export const NOTIFICATION_EVENT_CATALOG: CatalogEvent[] = [
  // ── MAINTENANCE ────────────────────────────────────────────────
  { code: 'MAINT_JOB_CARD_CREATED', name: 'Job Card Created', module: 'maintenance', description: 'A maintenance job card was created', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Maintenance Supervisor', 'Maintenance Manager'] },
  { code: 'MAINT_JOB_CARD_STARTED', name: 'Job Card Started', module: 'maintenance', description: 'A maintenance job card was started', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Maintenance Supervisor', 'Maintenance Manager'] },
  { code: 'MAINT_JOB_CARD_CLOSED', name: 'Job Card Closed', module: 'maintenance', description: 'A maintenance job card was closed', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Maintenance Supervisor', 'Maintenance Manager'] },
  { code: 'MAINT_JOB_CARD_SUBMITTED', name: 'Job Card Submitted for Verification', module: 'maintenance', description: 'A job card was submitted for verification', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Maintenance Supervisor', 'Maintenance Manager'] },
  { code: 'MAINT_JOB_CARD_VERIFIED', name: 'Job Card Verified', module: 'maintenance', description: 'A job card was verified', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Maintenance Supervisor', 'Maintenance Manager'] },
  { code: 'MAINT_JOB_CARD_APPROVED', name: 'Job Card Approved', module: 'maintenance', description: 'A job card was approved', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Maintenance Supervisor', 'Maintenance Manager'] },
  { code: 'MAINT_JOB_CARD_REJECTED', name: 'Job Card Rejected', module: 'maintenance', description: 'A job card was rejected', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Maintenance Supervisor', 'Maintenance Manager'] },
  { code: 'MAINT_PM_DUE', name: 'Preventive Maintenance Due', module: 'maintenance', description: 'A preventive maintenance plan is due', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Maintenance Supervisor', 'Maintenance Manager'] },
  { code: 'MAINT_PM_OVERDUE', name: 'Maintenance Overdue', module: 'maintenance', description: 'A preventive maintenance plan is overdue', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Maintenance Supervisor', 'Maintenance Manager'] },
  { code: 'MAINT_BREAKDOWN_REPORTED', name: 'Breakdown Reported', module: 'maintenance', description: 'A machine breakdown was reported', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Maintenance Supervisor', 'Maintenance Manager'] },

  // ── PROCUREMENT ────────────────────────────────────────────────
  { code: 'PROC_REQUISITION_CREATED', name: 'Purchase Requisition Created', module: 'procurement', description: 'A purchase requisition was created', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Procurement Manager'] },
  { code: 'PROC_REQUISITION_APPROVED', name: 'Purchase Requisition Approved', module: 'procurement', description: 'A purchase requisition was approved', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Procurement Manager'] },
  { code: 'PROC_RFQ_CREATED', name: 'RFQ Created', module: 'procurement', description: 'A request for quotation was created', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Procurement Manager'] },
  { code: 'PROC_QUOTATION_RECEIVED', name: 'Supplier Quotation Received', module: 'procurement', description: 'A supplier quotation was received', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Procurement Manager'] },
  { code: 'PROC_PO_CREATED', name: 'Purchase Order Created', module: 'procurement', description: 'A purchase order was created', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Procurement Manager'] },
  { code: 'PROC_PO_APPROVED', name: 'Purchase Order Approved', module: 'procurement', description: 'A purchase order was approved', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Procurement Manager'] },
  { code: 'PROC_GRN_CREATED', name: 'Goods Receipt Created', module: 'procurement', description: 'A goods receipt was created', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Procurement Manager', 'Warehouse Manager'] },
  { code: 'PROC_RETURN_CREATED', name: 'Purchase Return Created', module: 'procurement', description: 'A purchase return was created', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Procurement Manager'] },

  // ── SALES ──────────────────────────────────────────────────────
  { code: 'SALES_QUOTATION_CREATED', name: 'Sales Quotation Created', module: 'sales', description: 'A sales quotation was created', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Sales Manager'] },
  { code: 'SALES_QUOTATION_APPROVED', name: 'Sales Quotation Approved', module: 'sales', description: 'A sales quotation was approved', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Sales Manager'] },
  { code: 'SALES_SO_CREATED', name: 'Sales Order Created', module: 'sales', description: 'A sales order was created', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Sales Manager'] },
  { code: 'SALES_SO_APPROVED', name: 'Sales Order Approved', module: 'sales', description: 'A sales order was approved', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Sales Manager'] },
  { code: 'SALES_DELIVERY_CREATED', name: 'Delivery Created', module: 'sales', description: 'A delivery was created', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Sales Manager', 'Warehouse Manager'] },
  { code: 'SALES_INVOICE_CREATED', name: 'Sales Invoice Created', module: 'sales', description: 'A sales invoice was created', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Sales Manager', 'Finance Manager'] },
  { code: 'SALES_RETURN_CREATED', name: 'Sales Return Created', module: 'sales', description: 'A sales return was created', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Sales Manager'] },
  { code: 'SALES_PAYMENT_RECEIVED', name: 'Customer Payment Received', module: 'sales', description: 'A customer payment was received', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Sales Manager', 'Finance Manager'] },

  // ── INVENTORY ──────────────────────────────────────────────────
  { code: 'INV_TRANSFER_CREATED', name: 'Stock Transfer Created', module: 'inventory', description: 'A stock transfer was created', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Warehouse Manager'] },
  { code: 'INV_TRANSFER_COMPLETED', name: 'Stock Transfer Completed', module: 'inventory', description: 'A stock transfer was completed', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Warehouse Manager'] },
  { code: 'INV_LOW_STOCK', name: 'Low Stock', module: 'inventory', description: 'An item fell below its reorder level', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Warehouse Manager', 'Procurement Manager'] },
  { code: 'INV_ADJUSTMENT', name: 'Stock Adjustment', module: 'inventory', description: 'A stock adjustment was recorded', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Warehouse Manager'] },
  { code: 'INV_MATERIAL_ISSUE', name: 'Material Issue', module: 'inventory', description: 'A material issue was recorded', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Warehouse Manager', 'Production Manager'] },
  { code: 'INV_MATERIAL_RECEIPT', name: 'Material Receipt', module: 'inventory', description: 'A material receipt was recorded', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Warehouse Manager'] },

  // ── MANUFACTURING / PRODUCTION ─────────────────────────────────
  { code: 'MFG_PO_CREATED', name: 'Production Order Created', module: 'manufacturing', description: 'A production order was created', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Production Manager'] },
  { code: 'MFG_PO_RELEASED', name: 'Production Order Released', module: 'manufacturing', description: 'A production order was released', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Production Manager'] },
  { code: 'MFG_OP_STARTED', name: 'Operation Started', module: 'manufacturing', description: 'A production operation was started', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Production Manager'] },
  { code: 'MFG_OP_COMPLETED', name: 'Operation Completed', module: 'manufacturing', description: 'A production operation was completed', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Production Manager'] },
  { code: 'MFG_MATERIAL_ISSUE', name: 'Material Issue', module: 'manufacturing', description: 'A production material issue was recorded', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Production Manager', 'Warehouse Manager'] },
  { code: 'MFG_PO_COMPLETED', name: 'Production Completed', module: 'manufacturing', description: 'A production order was completed', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Production Manager'] },
  { code: 'MFG_SCRAP_GENERATED', name: 'Scrap Generated', module: 'manufacturing', description: 'Scrap was generated during production', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Production Manager', 'Quality Manager'] },

  // ── QUALITY ────────────────────────────────────────────────────
  { code: 'QC_INSPECTION_CREATED', name: 'Inspection Created', module: 'qc', description: 'A quality inspection was created', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Quality Manager'] },
  { code: 'QC_INSPECTION_FAILED', name: 'Inspection Failed', module: 'qc', description: 'A quality inspection failed', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Quality Manager', 'Production Manager'] },
  { code: 'QC_NCR_CREATED', name: 'NCR Created', module: 'qc', description: 'A non-conformance report was created', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Quality Manager'] },
  { code: 'QC_NCR_DISPOSITION', name: 'NCR Disposition Required', module: 'qc', description: 'An NCR requires disposition', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Quality Manager'] },
  { code: 'QC_CAPA_CREATED', name: 'CAPA Created', module: 'qc', description: 'A CAPA was created', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Quality Manager'] },
  { code: 'QC_CAPA_DUE', name: 'CAPA Due', module: 'qc', description: 'A CAPA is due', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Quality Manager'] },
  { code: 'QC_CAPA_CLOSED', name: 'CAPA Closed', module: 'qc', description: 'A CAPA was closed', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Quality Manager'] },

  // ── HR ─────────────────────────────────────────────────────────
  { code: 'HR_LEAVE_REQUESTED', name: 'Leave Request Created', module: 'hr', description: 'A leave request was created', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['HR Manager'] },
  { code: 'HR_LEAVE_APPROVAL', name: 'Leave Approval Required', module: 'hr', description: 'A leave request requires approval', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['HR Manager', 'Department Manager'] },
  { code: 'HR_LEAVE_APPROVED', name: 'Leave Approved', module: 'hr', description: 'A leave request was approved', defaultRecipientType: 'CREATOR', defaultRecipientRoles: [] },
  { code: 'HR_LEAVE_REJECTED', name: 'Leave Rejected', module: 'hr', description: 'A leave request was rejected', defaultRecipientType: 'CREATOR', defaultRecipientRoles: [] },
  { code: 'HR_ATTENDANCE_EXCEPTION', name: 'Attendance Exception', module: 'hr', description: 'An attendance exception was detected', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['HR Manager'] },
  { code: 'HR_SHIFT_ASSIGNED', name: 'Shift Assignment', module: 'hr', description: 'A shift was assigned to an employee', defaultRecipientType: 'CREATOR', defaultRecipientRoles: [] },

  // ── FINANCE ────────────────────────────────────────────────────
  { code: 'FIN_JOURNAL_CREATED', name: 'Journal Created', module: 'finance', description: 'A journal entry was created', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Finance Manager'] },
  { code: 'FIN_JOURNAL_POSTED', name: 'Journal Posted', module: 'finance', description: 'A journal entry was posted', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Finance Manager'] },
  { code: 'FIN_JOURNAL_REVERSED', name: 'Journal Reversed', module: 'finance', description: 'A journal entry was reversed', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Finance Manager'] },
  { code: 'FIN_PAYMENT_RECEIVED', name: 'Customer Payment Received', module: 'finance', description: 'A customer payment was received', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Finance Manager', 'Sales Manager'] },
  { code: 'FIN_SUPPLIER_PAYMENT', name: 'Supplier Payment Recorded', module: 'finance', description: 'A supplier payment was recorded', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Finance Manager'] },
  { code: 'FIN_INVOICE_DUE', name: 'Invoice Due', module: 'finance', description: 'An invoice is due', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Finance Manager', 'Sales Manager'] },
  { code: 'FIN_INVOICE_OVERDUE', name: 'Invoice Overdue', module: 'finance', description: 'An invoice is overdue', defaultRecipientType: 'ROLE', defaultRecipientRoles: ['Finance Manager', 'Sales Manager'] },
];
