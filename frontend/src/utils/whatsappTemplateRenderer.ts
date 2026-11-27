import { useEffect, useState } from 'react';

export const WHATSAPP_SETTINGS_STORAGE_KEY = 'erp_whatsapp_settings_v1';
export const WHATSAPP_SETTINGS_UPDATED_EVENT = 'pwi:whatsapp-settings-updated';
export const DEFAULT_COMPANY_NAME = 'Pakistan Wire Industries (Pvt.) LTD';

export type WhatsAppTemplateCategory =
  | 'Raw Material & Inventory'
  | 'Sales, Dispatch & Receivables'
  | 'Procurement'
  | 'Production & Packing'
  | 'Maintenance & Quality (QMS)'
  | 'AI Assistant & System';

export type WhatsAppTemplateKey =
  | 'rmReceipt'
  | 'rmReceiptItemLine'
  | 'rmSummary'
  | 'rmItemWise'
  | 'rmBalanceOnly'
  | 'rmReturn'
  | 'itemStockLedger'
  | 'storeIssueNote'
  | 'quotation'
  | 'salesOrder'
  | 'salesDelivery'
  | 'invoice'
  | 'reminder'
  | 'receipt'
  | 'statement'
  | 'purchaseOrder'
  | 'dailyProductionFleet'
  | 'dailyProductionDirectorSummary'
  | 'dailyProductionDirectorDeptBlock'
  | 'dailyProductionReport'
  | 'productionDowntime'
  | 'productionInventoryReport'
  | 'productionInventoryBatch'
  | 'productionMaterialFlow'
  | 'productionMultiDept'
  | 'packingDailyProduction'
  | 'packingCustomerDispatch'
  | 'packingFgrStock'
  | 'packingNippleDeficit'
  | 'maintenanceJobCard'
  | 'qmsInspection'
  | 'qmsBatchSummary'
  | 'aiAnalyticsReport'
  | 'mobileAppInstall';

export interface WhatsAppTemplateDefinition {
  key: WhatsAppTemplateKey;
  code: string;
  title: string;
  category: WhatsAppTemplateCategory;
  description: string;
  rows: number;
  defaultTemplate: string;
  placeholders: string[];
}

export interface StoredWhatsAppSettings {
  countryCode?: string;
  templates?: Partial<Record<WhatsAppTemplateKey | string, string>>;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * CANONICAL CLEAN ENGLISH DEFAULT TEMPLATES (100% Editable in Settings)
 * ──────────────────────────────────────────────────────────────────────────── */

export const DEFAULT_RM_RECEIPT_TEMPLATE = `*{company}*
*RAW MATERIAL RECEIVING (GATE PASS)*
━━━━━━━━━━━━━━━━━━━━━━━━━
*Receipt Date:* {date}
*Receipt Code:* {receipt_code}
*Gate Pass No:* {gate_pass_no}
*PO Number:* {po_no}
*Source / DC No:* {source_no}
*Heat Number:* {heat_number}
*Warehouse:* {warehouse}
*Division:* {division}
*Section:* {section}
━━━━━━━━━━━━━━━━━━━━━━━━━
*MATERIAL ITEMS ({lines_count}):*
{items}
━━━━━━━━━━━━━━━━━━━━━━━━━
*RECEIPT SUMMARY TOTALS:*
• Total Gate Pass Qty: {total_gp_qty}
• Total Received Qty: {total_rcv_qty}
• Net Variance: {net_variance}
━━━━━━━━━━━━━━━━━━━━━━━━━
_Generated via PWI ERP System_`;

export const DEFAULT_RM_RECEIPT_ITEM_LINE_TEMPLATE = `*{index}. {item}*
   • Gate Pass Qty: {gp_qty}
   • Received Qty: {rcv_qty}
   • Status: {status}`;

export const DEFAULT_RM_SUMMARY_TEMPLATE = `*{company}*
*Raw Material Receiving — Gate Pass Summary*
━━━━━━━━━━━━━━━━━━━━━━━━━
*Date Range:* {date}
*Division:* {division}
*Warehouse:* {warehouse}
━━━━━━━━━━━━━━━━━━━━━━━━━
• Total Receipts: {receipts_count}
• Active POs / Materials: {po_count} | {materials_count}
• Gate Pass Declared: {total_gp_qty}
• Total Received: {total_rcv_qty}
• Material Returned: {total_ret_qty}
• Net In-Hand Balance: {net_in_hand}
• Net Variance: {net_variance}
━━━━━━━━━━━━━━━━━━━━━━━━━
{items}
━━━━━━━━━━━━━━━━━━━━━━━━━
_Generated via PWI ERP System_`;

export const DEFAULT_RM_ITEM_WISE_TEMPLATE = `*{company}*
*Raw Material Receiving — Item-Wise Breakdown*
━━━━━━━━━━━━━━━━━━━━━━━━━
*Date Range:* {date}
*Division:* {division}
*Warehouse:* {warehouse}
━━━━━━━━━━━━━━━━━━━━━━━━━
• Distinct Materials: {materials_count}
• Total Gate Passes: {receipts_count}
• Gate Pass Declared: {total_gp_qty}
• Total Received: {total_rcv_qty}
• Total Returned: {total_ret_qty}
• Net In-Hand Balance: {net_in_hand}
• Net Variance: {net_variance}
━━━━━━━━━━━━━━━━━━━━━━━━━
*Material Breakdown:*
{items}
━━━━━━━━━━━━━━━━━━━━━━━━━
_Generated via PWI ERP System_`;

export const DEFAULT_RM_BALANCE_ONLY_TEMPLATE = `*{company}*
*Raw Material Current Stock & Balances*
━━━━━━━━━━━━━━━━━━━━━━━━━
*Date:* {date}
*Division:* {division}
*Warehouse:* {warehouse}
━━━━━━━━━━━━━━━━━━━━━━━━━
*Item & Balance List:*
{items}
━━━━━━━━━━━━━━━━━━━━━━━━━
• Total Materials: {materials_count}
• Total Store Balance: *{total_balance}*
━━━━━━━━━━━━━━━━━━━━━━━━━
_Generated via PWI ERP System_`;

export const DEFAULT_RM_RETURN_TEMPLATE = `*{company}*
*RAW MATERIAL RETURN NOTE*
━━━━━━━━━━━━━━━━━━━━━━━━━
*Return Date:* {date}
*Return Code:* {return_code}
*Source / DC No:* {source_no}
*Ref Gate Pass:* {ref_receipt}
*Return Warehouse:* {warehouse}
*Division:* {division}
*Section:* {section}
*Reason:* {reason}
━━━━━━━━━━━━━━━━━━━━━━━━━
{items}
━━━━━━━━━━━━━━━━━━━━━━━━━
*RETURN SUMMARY TOTAL:*
• Total Returned Qty: {total_qty}
━━━━━━━━━━━━━━━━━━━━━━━━━
_Generated via PWI ERP System_`;

export const DEFAULT_ITEM_LEDGER_WHATSAPP_TEMPLATE = `*{company}*
*ITEM STOCK LEDGER & AUDIT TRAIL*
────────────────────────────
*Item:* {item_code}
*Description:* {item_name}
*Warehouse:* {warehouse}
*Base Unit:* {uom}
*Date:* {date}
────────────────────────────
*STOCK SUMMARY:*
• Opening Balance: {opening_balance}
• Total Received (+IN): {total_in}
• Total Issued (-OUT): {total_out}
• *Current Live Balance:* {current_balance}
• Audit Movements: {movements_count} entries

*RECENT MOVEMENTS:*
{recent_movements}
────────────────────────────
_Generated via PWI ERP System_`;

export const DEFAULT_STORE_ISSUE_NOTE_TEMPLATE = `*{company}*
*STORE ISSUE NOTE (SIN)*
━━━━━━━━━━━━━━━━━━━━━━━━━
*SIN Number:* {sin_number}
*Issue Date:* {date}
*Division:* {division}
*Section:* {section}
*Machine / Allocation:* {machine}
*Receiver:* {receiver}
*Issued By:* {issued_by}
━━━━━━━━━━━━━━━━━━━━━━━━━
*ISSUED PARTS & QUANTITIES:*
{items}
━━━━━━━━━━━━━━━━━━━━━━━━━
*LAST ISSUED & PRODUCTION OUTPUT:*
{last_issued_summary}
━━━━━━━━━━━━━━━━━━━━━━━━━
*REMAINING STORE STOCK:*
{remaining_stock}
━━━━━━━━━━━━━━━━━━━━━━━━━
*Remarks:* {remarks}
_Generated via PWI ERP System_`;

export const DEFAULT_QUOTATION_WHATSAPP_TEMPLATE = `*{company}*
*COMMERCIAL QUOTATION*
━━━━━━━━━━━━━━━━━━━━━━━━━
Dear *{customer}*,

Please find the summary of Quotation *{doc_no}* dated *{date}*:
• *Total Quoted Amount:* {amount}
• *Valid Until:* {due_date}

{items}
View Portal: {link}
━━━━━━━━━━━━━━━━━━━━━━━━━
Thank you,
*{company}*`;

export const DEFAULT_SALES_ORDER_WHATSAPP_TEMPLATE = `*{company}*
*SALES ORDER / SOC CONFIRMATION*
━━━━━━━━━━━━━━━━━━━━━━━━━
*Customer:* {customer}
*SOC / Order No:* {doc_no}
*Customer PO:* {customer_po}
*Order Date:* {date}
*Expected Delivery:* {delivery_date}
*Division:* {division}
*Status:* {status}
*Total Order Value:* {amount}
━━━━━━━━━━━━━━━━━━━━━━━━━
*ORDERED ITEMS:*
{items}
━━━━━━━━━━━━━━━━━━━━━━━━━
_Generated via PWI ERP System_`;

export const DEFAULT_SALES_DELIVERY_WHATSAPP_TEMPLATE = `*{company}*
*DELIVERY CHALLAN / OUTWARD GATE PASS*
━━━━━━━━━━━━━━━━━━━━━━━━━
*Customer:* {customer}
*Delivery Note No:* {doc_no}
*Gate Pass No:* {gate_pass_no}
*SOC / Order No:* {soc_no}
*Customer PO:* {customer_po}
*Dispatch Date:* {date}
*Division:* {division}
*Transporter:* {carrier}
*Vehicle / Bilty No:* {vehicle_no}
━━━━━━━━━━━━━━━━━━━━━━━━━
*DISPATCHED ITEMS:*
{items}
━━━━━━━━━━━━━━━━━━━━━━━━━
• *Total Dispatched Qty:* {total_qty}
• *Total Cartons / Packs:* {total_cartons}
━━━━━━━━━━━━━━━━━━━━━━━━━
_Generated via PWI ERP System_`;

export const DEFAULT_INVOICE_WHATSAPP_TEMPLATE = `*{company}*
*SALES TAX INVOICE*
━━━━━━━━━━━━━━━━━━━━━━━━━
Dear *{customer}*,

Invoice *{doc_no}* dated *{date}* has been issued:
• *SOC / Order Ref:* {soc_no}
• *Invoice Amount:* {amount}
• *Balance Due:* {balance}
• *Due Date:* {due_date}

{items}
Portal Link: {link}
━━━━━━━━━━━━━━━━━━━━━━━━━
Thank you,
*{company}*`;

export const DEFAULT_REMINDER_WHATSAPP_TEMPLATE = `*{company}*
*PAYMENT REMINDER*
━━━━━━━━━━━━━━━━━━━━━━━━━
Dear *{customer}*,

This is a polite reminder that an outstanding balance of *{balance}* remains due against Invoice *{doc_no}* (Invoice Total: {amount}, Due Date: {due_date}).

Portal Link: {link}
━━━━━━━━━━━━━━━━━━━━━━━━━
Thank you,
*{company}*`;

export const DEFAULT_PAYMENT_RECEIPT_WHATSAPP_TEMPLATE = `*{company}*
*CUSTOMER PAYMENT RECEIPT*
━━━━━━━━━━━━━━━━━━━━━━━━━
Dear *{customer}*,

We acknowledge receipt of *{amount}* against Receipt Voucher *{doc_no}* on *{date}*.
• *Payment Mode:* {payment_mode}
• *Reference / Cheque No:* {reference_no}
• *Allocated to Invoices:* {allocated_amount}
• *Unallocated Advance:* {unallocated_amount}
━━━━━━━━━━━━━━━━━━━━━━━━━
Thank you for your payment,
*{company}*`;

export const DEFAULT_STATEMENT_WHATSAPP_TEMPLATE = `*{company}*
*CUSTOMER ACCOUNT STATEMENT SUMMARY*
━━━━━━━━━━━━━━━━━━━━━━━━━
Dear *{customer}* ({customer_code}),

Here is your current account standing as of *{date}*:
• *Division:* {division}
• *Open Invoices:* {open_invoices}
• *Unadjusted Advance:* {advance_balance}
• *Net Account Balance:* *{balance}*
━━━━━━━━━━━━━━━━━━━━━━━━━
Please contact our Accounts Department if you need a detailed ledger statement.
*{company}*`;

export const DEFAULT_PURCHASE_ORDER_WHATSAPP_TEMPLATE = `*{company}*
*PURCHASE ORDER*
━━━━━━━━━━━━━━━━━━━━━━━━━
*Supplier:* {supplier}
*PO Number:* {doc_no}
*Order Date:* {date}
*Expected Delivery:* {delivery_date}
*Division:* {division}
*Receiving Warehouse:* {warehouse}
*Payment Terms:* {payment_terms}
*Status:* {status}
*Total PO Value:* {amount}
━━━━━━━━━━━━━━━━━━━━━━━━━
*ORDERED MATERIALS:*
{items}
━━━━━━━━━━━━━━━━━━━━━━━━━
_Generated via PWI ERP System_`;

export const DEFAULT_FLEET_TEMPLATE = `*{company}*
*DAILY SHIFT PRODUCTION REPORT*
━━━━━━━━━━━━━━━━━━━━
*Department:* *{department}*
*Date:* *{date}*
{shift_line}*Division:* *{division}*
{section_line}*Fleet Status:* {fleet_status}
━━━━━━━━━━━━━━━━━━━━

*MACHINE-WISE PRODUCTION:*

{machine_rows}
━━━━━━━━━━━━━━━━━━━━
*{department} TOTALS:*
• *Total Machines:* {fleet_status}
• *Total Production:* *{total_production}*
• *Overall Achievement:* *{overall_achievement}*

*ITEM-WISE TOTAL SUMMARY:*
{item_summary}
━━━━━━━━━━━━━━━━━━━━
_Generated via PWI ERP System_`;

export const DEFAULT_DIRECTOR_SUMMARY_TEMPLATE = `📊 *DAILY PRODUCTION SUMMARY*
🏭 *Division:* {division}
📅 *Date:* {date}

{department_blocks}

✅ *Generated via PWI ERP System*`;

export const DEFAULT_DIRECTOR_SUMMARY_DEPT_TEMPLATE = `🔹 *{index}. {department}*
Target: {target}
Actual: {actual} ({achievement})
Part Rejection: {part_rejection}
Process Scrap: {process_scrap}
*Item Breakdown:*
{item_rows}`;

export const DEFAULT_DAILY_PRODUCTION_REPORT_TEMPLATE = `*{company}*
*DAILY PRODUCTION REPORT — {division}*
*{date}*{shift_suffix}
*Audited:* {audited}
━━━━━━━━━━━━━━━━━━━━
{report_body}
━━━━━━━━━━━━━━━━━━━━
_Report generated via PWI ERP System • {generated_label}_`;

export const DEFAULT_PRODUCTION_DOWNTIME_TEMPLATE = `*{company}*
*Daily Production & Downtime Report*
*Date:* {date} ({weekday})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Total Running Time (RT): {running_hours}
• Total Downtime (DT): {downtime_hours}
• Total Shift Time: {total_time}
• Downtime Rate: {downtime_rate}
• Dominant Stoppage: {top_reason}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*Department-Wise Breakdown:*
{department_rows}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Generated via PWI ERP System_`;

export const DEFAULT_PRODUCTION_INVENTORY_TEMPLATE = `*{company}*
*{title}*
Division: {division}
Department: {department}
Date Range: {date}
-----------------------------
*Total Items:* {total_items}
*On Hand Stock:* {on_hand}
*Available Stock:* {available}
*Total IN (range):* {total_in}
*Total OUT (range):* {total_out}
*Produced:* {produced}
*Required:* {required}
*Short Items:* {short_items}
-----------------------------
_Generated via PWI ERP System_`;

export const DEFAULT_PRODUCTION_INVENTORY_BATCH_TEMPLATE = `*{company}*
*Production Inventory — Selected Batch Summary ({items_count} Items)*
Division: {division} | Dept: {department}
Date: {date}
-----------------------------------------
{items}
_Generated via PWI ERP System_`;

export const DEFAULT_PRODUCTION_MATERIAL_FLOW_TEMPLATE = `*{company}*
*End-to-End Material Flow & Traceability Journey*
Item: *{item_code}* — {item_name}
Date: {date}
-----------------------------------------
{stages}
_Generated via PWI ERP System_`;

export const DEFAULT_PRODUCTION_MULTI_DEPT_TEMPLATE = `*{company}*
*Multi-Department Production & Stock Report*
Division: {division}
Departments: {departments}
Date: {date}
-----------------------------
{department_rows}
_Generated via PWI ERP System_`;

export const DEFAULT_PACKING_DAILY_REPORT_TEMPLATE = `*{company}*
*DAILY PACKING PRODUCTION & DISPATCH REPORT*
*Date:* {date} | *Time:* {time}
*Division:* {division} | *Shift:* {shift}
━━━━━━━━━━━━━━━━━━━━━━━━━━

*TODAY'S RECORDED PACKING BATCHES:*
{batches}

━━━━━━━━━━━━━━━━━━━━━━━━━━
*TODAY'S PRODUCTION TOTALS (PCS -> GRS -> CTN):*
1. *Total Pieces Packed:* {total_pcs}
2. *Total Gross Packed:* {total_gross}
3. *Total Cartons Packed:* {total_cartons}
• *Total Net Weight Packed:* {total_weight}
• *Day Target Progress:* {day_progress}
━━━━━━━━━━━━━━━━━━━━━━━━━━
_Prepared by Packing Department Supervisor, PWI_`;

export const DEFAULT_PACKING_CUSTOMER_DISPATCH_TEMPLATE = `*{company}*
*PACKED FINISHED GOODS INVENTORY DISPATCH REPORT*
*Date:* {date}
────────────────────────────
*Customer:* {customer}
{soc_line}*Division:* {division}
────────────────────────────
*PACKED FINISHED GOODS DETAIL:*
{items}

────────────────────────────
*TOTAL SUMMARY (Pieces -> Gross -> Cartons):*
1. *Total Pieces:* {total_pcs}
2. *Total Gross:* {total_gross}
3. *Total Cartons:* {total_cartons}
• *Total Weight:* {total_weight}
• *Total Valuation:* {total_valuation}
────────────────────────────
*Verified & Ready for Dispatch by Packing Dept, PWI*`;

export const DEFAULT_PACKING_FGR_STOCK_TEMPLATE = `*{company}*
*FGR FINISHED GOODS WAREHOUSE STOCK REPORT*
*Warehouse:* {warehouse}
*Date:* {date} | *Time:* {time}
━━━━━━━━━━━━━━━━━━━━━━━━━━

*LIVE FGR STOCK BREAKDOWN:*
{items}

━━━━━━━━━━━━━━━━━━━━━━━━━━
*FGR EXECUTIVE TOTALS (PCS -> GRS -> CTN):*
1. *Total Available Pieces:* {total_pcs}
2. *Total Available Gross:* {total_gross}
3. *Total Available Cartons:* {total_cartons}
• *Total Net Weight in Stock:* {total_weight}
• *Total Stock Valuation:* {total_valuation}
━━━━━━━━━━━━━━━━━━━━━━━━━━
_Official Live FGR Stock Balance verified by Packing & Warehouse Team_`;

export const DEFAULT_PACKING_NIPPLE_DEFICIT_TEMPLATE = `*{company}*
*WITHOUT NIPPLE PACK · SAFETY STOCK INVENTORY REPORT*
*Date & Time:* {date}
*Department:* {department}
-------------------------------------------
*EXECUTIVE SUMMARY:*
• *Distinct FG Items:* {distinct_items} Items
• *Waiting Incomplete Batches:* {waiting_batches} Batches
• *Total Waiting Cartons:* *{total_pending_cartons} Cartons*
• *Total Packed Quantity:* {total_pending_gross} GRS ({total_pending_pcs} PCS)
• *Total Packed Weight:* *{total_packed_weight} KG (Spokes Only · Without Nipple)*
• *Total Missing Nipple Deficit:* *{total_pending_gross} GRS Required*
-------------------------------------------

*ITEM-WISE CONSOLIDATED STOCK & NIPPLE DEFICIT:*
{items}

*STATUS NOTE:* All items above are packed in White Poly Bags and held in Safety Stock until nipples arrive from store.
_Generated via PWI ERP System_`;

export const DEFAULT_JOB_CARD_WHATSAPP_TEMPLATE = `*{company}*
*MAINTENANCE JOB CARD SUMMARY*
━━━━━━━━━━━━━━━━━━━━━━━━━
*Job Card #:* *{job_card_no}*
*Status:* *{status}*
{priority_line}━━━━━━━━━━━━━━━━━━━━━━━━━
*Machine / Asset:* *{machine}*
{hierarchy_line}{location_line}{team_line}━━━━━━━━━━━━━━━━━━━━━━━━━
*Reported Fault / Complaint:*
"{complaint}"
{reported_by_line}{timings_section}{technicians_section}{parts_section}{actions_section}━━━━━━━━━━━━━━━━━━━━━━━━━
_Generated via PWI ERP System • {generated_at}_`;

export const DEFAULT_QMS_INSPECTION_WHATSAPP_TEMPLATE = `====================================
*{company}*
*IN-PROCESS QUALITY INSPECTION REPORT*
====================================

*Doc Ref:* {doc_ref} | *Rev:* {rev_no} | *Date:* {issue_date}
*Inspection #:* {inspection_no}

------------------------------------
*GENERAL METADATA*
------------------------------------
• *Division:* {division}
• *Department:* {department}
• *Date:* {date} | *Shift:* {shift}
• *Machine:* {machine} | *Operator:* {operator}
• *Part / Item:* *{item_name}* ({item_code})
• *Inspector:* {inspector}
{approved_by_line}
{samples_section}{attributes_section}
====================================
*OVERALL RESULT:* *{overall_result}*
*Remarks:* {remarks}
====================================
_Verified & Generated via PWI ERP System_`;

export const DEFAULT_QMS_BATCH_WHATSAPP_TEMPLATE = `====================================
*{company}*
*QMS INSPECTION BATCH SUMMARY ({records_count} RECORDS)*
====================================
*Generated Date:* {date}

{items}

*Batch Total:* {records_count} Inspections | *Passed:* {passed_count} | *Failed:* {failed_count}
_Verified & Generated via PWI ERP System_`;

export const DEFAULT_AI_REPORT_WHATSAPP_TEMPLATE = `*{company}*
*{title}*
━━━━━━━━━━━━━━━━━━━━
*Division:* *{division}*
*Department:* *{department}*
*Date / Period:* *{date}*
━━━━━━━━━━━━━━━━━━━━
{items}
{summary}
━━━━━━━━━━━━━━━━━━━━
_Generated via PWI ERP AI Assistant_`;

export const DEFAULT_MOBILE_APP_INSTALL_TEMPLATE = `*{company}* — Mobile ERP Application
{link}

Open this link in Chrome or Safari on your mobile phone to install the PWI ERP application.`;

/* ─────────────────────────────────────────────────────────────────────────────
 * MASTER WHATSAPP TEMPLATE REGISTRY (ALL 33 TEMPLATES)
 * ──────────────────────────────────────────────────────────────────────────── */

export const WHATSAPP_TEMPLATE_REGISTRY: readonly WhatsAppTemplateDefinition[] = [
  // 1. Raw Material & Inventory
  {
    key: 'rmReceipt',
    code: '[RM-GP]',
    title: 'Raw Material Receipt (Gate Pass)',
    category: 'Raw Material & Inventory',
    description: 'Used when sharing an individual Raw Material Gate Pass receipt (e.g., RMR-00253).',
    rows: 8,
    defaultTemplate: DEFAULT_RM_RECEIPT_TEMPLATE,
    placeholders: [
      '{company}',
      '{date}',
      '{receipt_code}',
      '{gate_pass_no}',
      '{po_no}',
      '{source_no}',
      '{heat_number}',
      '{warehouse}',
      '{division}',
      '{section}',
      '{lines_count}',
      '{items}',
      '{total_gp_qty}',
      '{total_rcv_qty}',
      '{net_variance}',
    ],
  },
  {
    key: 'rmReceiptItemLine',
    code: '[RM-GP-LINE]',
    title: 'Raw Material Receipt — Item Line Format (Sub-Template for {items})',
    category: 'Raw Material & Inventory',
    description: 'Controls how each material row inside {items} is formatted for [RM-GP].',
    rows: 4,
    defaultTemplate: DEFAULT_RM_RECEIPT_ITEM_LINE_TEMPLATE,
    placeholders: [
      '{index}',
      '{item}',
      '{item_name}',
      '{item_code}',
      '{uom}',
      '{gp_qty}',
      '{rcv_qty}',
      '{variance}',
      '{status}',
    ],
  },
  {
    key: 'rmSummary',
    code: '[RM-SUMMARY]',
    title: 'Raw Material Receiving Summary (Gate Pass Overview)',
    category: 'Raw Material & Inventory',
    description: 'Used by Raw Material Receiving -> Share Summary -> Gate Pass Overview tab.',
    rows: 7,
    defaultTemplate: DEFAULT_RM_SUMMARY_TEMPLATE,
    placeholders: [
      '{company}',
      '{date}',
      '{division}',
      '{warehouse}',
      '{receipts_count}',
      '{po_count}',
      '{materials_count}',
      '{total_gp_qty}',
      '{total_rcv_qty}',
      '{total_ret_qty}',
      '{net_in_hand}',
      '{net_variance}',
      '{items}',
    ],
  },
  {
    key: 'rmItemWise',
    code: '[RM-ITEM-WISE]',
    title: 'Raw Material Receiving — Item-Wise Breakdown',
    category: 'Raw Material & Inventory',
    description: 'Used by Raw Material Receiving -> Share Summary -> Item Breakdown tab.',
    rows: 7,
    defaultTemplate: DEFAULT_RM_ITEM_WISE_TEMPLATE,
    placeholders: [
      '{company}',
      '{date}',
      '{division}',
      '{warehouse}',
      '{materials_count}',
      '{receipts_count}',
      '{total_gp_qty}',
      '{total_rcv_qty}',
      '{total_ret_qty}',
      '{net_in_hand}',
      '{net_variance}',
      '{items}',
    ],
  },
  {
    key: 'rmBalanceOnly',
    code: '[RM-BALANCE]',
    title: 'Raw Material Current Stock & Store Balances',
    category: 'Raw Material & Inventory',
    description: 'Used by Raw Material Receiving -> Share Summary -> Item & Balance Only tab.',
    rows: 6,
    defaultTemplate: DEFAULT_RM_BALANCE_ONLY_TEMPLATE,
    placeholders: [
      '{company}',
      '{date}',
      '{division}',
      '{warehouse}',
      '{materials_count}',
      '{total_balance}',
      '{items}',
    ],
  },
  {
    key: 'rmReturn',
    code: '[RM-RET]',
    title: 'Raw Material Return Note',
    category: 'Raw Material & Inventory',
    description: 'Used when sharing a Raw Material Return note / outward return challan.',
    rows: 7,
    defaultTemplate: DEFAULT_RM_RETURN_TEMPLATE,
    placeholders: [
      '{company}',
      '{date}',
      '{return_code}',
      '{source_no}',
      '{ref_receipt}',
      '{warehouse}',
      '{division}',
      '{section}',
      '{reason}',
      '{items}',
      '{total_qty}',
    ],
  },
  {
    key: 'itemStockLedger',
    code: '[INV-LEDGER]',
    title: 'Item Stock Ledger & Audit Trail',
    category: 'Raw Material & Inventory',
    description: 'Used when sharing an Item Stock Ledger from Inventory or Production Inventory.',
    rows: 7,
    defaultTemplate: DEFAULT_ITEM_LEDGER_WHATSAPP_TEMPLATE,
    placeholders: [
      '{company}',
      '{item_code}',
      '{item_name}',
      '{warehouse}',
      '{uom}',
      '{date}',
      '{opening_balance}',
      '{total_in}',
      '{total_out}',
      '{current_balance}',
      '{movements_count}',
      '{recent_movements}',
    ],
  },
  {
    key: 'storeIssueNote',
    code: '[SIN-ISSUE]',
    title: 'Store Issue Note (SIN)',
    category: 'Raw Material & Inventory',
    description: 'Used when sharing a Store Issue Note (SIN) via WhatsApp from the Store Issue form or directory table.',
    rows: 10,
    defaultTemplate: DEFAULT_STORE_ISSUE_NOTE_TEMPLATE,
    placeholders: [
      '{company}',
      '{sin_number}',
      '{date}',
      '{division}',
      '{section}',
      '{machine}',
      '{receiver}',
      '{issued_by}',
      '{items}',
      '{last_issued_summary}',
      '{remaining_stock}',
      '{remarks}',
    ],
  },

  // 2. Sales, Dispatch & Receivables
  {
    key: 'quotation',
    code: '[QUO-SHARE]',
    title: 'Commercial Sales Quotation',
    category: 'Sales, Dispatch & Receivables',
    description: 'Used when sharing a Commercial Quotation with a customer.',
    rows: 6,
    defaultTemplate: DEFAULT_QUOTATION_WHATSAPP_TEMPLATE,
    placeholders: [
      '{company}',
      '{customer}',
      '{doc_no}',
      '{date}',
      '{due_date}',
      '{amount}',
      '{items}',
      '{link}',
    ],
  },
  {
    key: 'salesOrder',
    code: '[SO-CONFIRM]',
    title: 'Sales Order / SOC Confirmation',
    category: 'Sales, Dispatch & Receivables',
    description: 'Used when sharing a Sales Order / SOC confirmation from Sales Orders.',
    rows: 7,
    defaultTemplate: DEFAULT_SALES_ORDER_WHATSAPP_TEMPLATE,
    placeholders: [
      '{company}',
      '{customer}',
      '{doc_no}',
      '{customer_po}',
      '{date}',
      '{delivery_date}',
      '{division}',
      '{status}',
      '{amount}',
      '{items}',
      '{link}',
    ],
  },
  {
    key: 'salesDelivery',
    code: '[DN-GP]',
    title: 'Sales Delivery Challan / Outward Gate Pass',
    category: 'Sales, Dispatch & Receivables',
    description: 'Used when sharing a Delivery Challan, Loading Advice, or Outward Dispatch Gate Pass.',
    rows: 7,
    defaultTemplate: DEFAULT_SALES_DELIVERY_WHATSAPP_TEMPLATE,
    placeholders: [
      '{company}',
      '{customer}',
      '{doc_no}',
      '{gate_pass_no}',
      '{soc_no}',
      '{customer_po}',
      '{date}',
      '{division}',
      '{carrier}',
      '{vehicle_no}',
      '{total_qty}',
      '{total_cartons}',
      '{items}',
    ],
  },
  {
    key: 'invoice',
    code: '[INV-SHARE]',
    title: 'Sales Tax Invoice',
    category: 'Sales, Dispatch & Receivables',
    description: 'Used when sharing a Sales Tax Invoice from Sales Invoices.',
    rows: 6,
    defaultTemplate: DEFAULT_INVOICE_WHATSAPP_TEMPLATE,
    placeholders: [
      '{company}',
      '{customer}',
      '{doc_no}',
      '{soc_no}',
      '{date}',
      '{due_date}',
      '{amount}',
      '{balance}',
      '{items}',
      '{link}',
    ],
  },
  {
    key: 'reminder',
    code: '[INV-REMIND]',
    title: 'Customer Invoice Payment Reminder',
    category: 'Sales, Dispatch & Receivables',
    description: 'Used when sending an overdue or pending invoice payment reminder.',
    rows: 5,
    defaultTemplate: DEFAULT_REMINDER_WHATSAPP_TEMPLATE,
    placeholders: [
      '{company}',
      '{customer}',
      '{doc_no}',
      '{date}',
      '{due_date}',
      '{amount}',
      '{balance}',
      '{link}',
    ],
  },
  {
    key: 'receipt',
    code: '[PAY-RECEIPT]',
    title: 'Customer Payment Receipt Voucher',
    category: 'Sales, Dispatch & Receivables',
    description: 'Used when sharing a Customer Payment Receipt voucher.',
    rows: 6,
    defaultTemplate: DEFAULT_PAYMENT_RECEIPT_WHATSAPP_TEMPLATE,
    placeholders: [
      '{company}',
      '{customer}',
      '{doc_no}',
      '{date}',
      '{payment_mode}',
      '{reference_no}',
      '{amount}',
      '{allocated_amount}',
      '{unallocated_amount}',
    ],
  },
  {
    key: 'statement',
    code: '[CUST-STMT]',
    title: 'Customer Account Balance & Ledger Statement',
    category: 'Sales, Dispatch & Receivables',
    description: 'Used when sharing a Customer Account Statement / Live Balance summary.',
    rows: 6,
    defaultTemplate: DEFAULT_STATEMENT_WHATSAPP_TEMPLATE,
    placeholders: [
      '{company}',
      '{customer}',
      '{customer_code}',
      '{division}',
      '{date}',
      '{open_invoices}',
      '{advance_balance}',
      '{balance}',
    ],
  },

  // 3. Procurement
  {
    key: 'purchaseOrder',
    code: '[PO-SHARE]',
    title: 'Supplier Purchase Order',
    category: 'Procurement',
    description: 'Used when sharing an approved or draft Purchase Order with a supplier.',
    rows: 7,
    defaultTemplate: DEFAULT_PURCHASE_ORDER_WHATSAPP_TEMPLATE,
    placeholders: [
      '{company}',
      '{supplier}',
      '{doc_no}',
      '{date}',
      '{delivery_date}',
      '{division}',
      '{warehouse}',
      '{payment_terms}',
      '{status}',
      '{amount}',
      '{items}',
    ],
  },

  // 4. Production & Packing
  {
    key: 'dailyProductionFleet',
    code: '[PROD-FLEET]',
    title: 'Daily Shift Production Report (Department Fleet)',
    category: 'Production & Packing',
    description: 'Used by Daily Production Entry -> Department Fleet WhatsApp Share.',
    rows: 8,
    defaultTemplate: DEFAULT_FLEET_TEMPLATE,
    placeholders: [
      '{company}',
      '{department}',
      '{date}',
      '{shift}',
      '{shift_line}',
      '{division}',
      '{section}',
      '{section_line}',
      '{fleet_status}',
      '{machines_count}',
      '{entered_count}',
      '{pending_count}',
      '{total_production}',
      '{overall_achievement}',
      '{machine_rows}',
      '{item_summary}',
    ],
  },
  {
    key: 'dailyProductionDirectorSummary',
    code: '[PROD-DIR-SUMMARY]',
    title: 'Daily Production Summary (Director Executive Breakdown)',
    category: 'Production & Packing',
    description: 'Main wrapper template for Director Executive Daily Production Summary.',
    rows: 6,
    defaultTemplate: DEFAULT_DIRECTOR_SUMMARY_TEMPLATE,
    placeholders: ['{company}', '{division}', '{date}', '{department_blocks}'],
  },
  {
    key: 'dailyProductionDirectorDeptBlock',
    code: '[PROD-DIR-DEPT]',
    title: 'Director Summary — Department Block Sub-Template',
    category: 'Production & Packing',
    description: 'Formats each department block rendered inside {department_blocks} of [PROD-DIR-SUMMARY].',
    rows: 6,
    defaultTemplate: DEFAULT_DIRECTOR_SUMMARY_DEPT_TEMPLATE,
    placeholders: [
      '{index}',
      '{department}',
      '{target}',
      '{actual}',
      '{achievement}',
      '{part_rejection}',
      '{process_scrap}',
      '{item_rows}',
    ],
  },
  {
    key: 'dailyProductionReport',
    code: '[PROD-FULL]',
    title: 'Daily Production Full Report',
    category: 'Production & Packing',
    description: 'Used by Daily Production Full Report WhatsApp Modal.',
    rows: 6,
    defaultTemplate: DEFAULT_DAILY_PRODUCTION_REPORT_TEMPLATE,
    placeholders: [
      '{company}',
      '{division}',
      '{date}',
      '{shift_suffix}',
      '{audited}',
      '{report_body}',
      '{generated_label}',
    ],
  },
  {
    key: 'productionDowntime',
    code: '[PROD-DT]',
    title: 'Daily Production & Downtime Report',
    category: 'Production & Packing',
    description: 'Used by Production Downtime Analytics daily WhatsApp share.',
    rows: 6,
    defaultTemplate: DEFAULT_PRODUCTION_DOWNTIME_TEMPLATE,
    placeholders: [
      '{company}',
      '{date}',
      '{weekday}',
      '{running_hours}',
      '{downtime_hours}',
      '{total_time}',
      '{downtime_rate}',
      '{top_reason}',
      '{department_rows}',
    ],
  },
  {
    key: 'productionInventoryReport',
    code: '[PROD-INV]',
    title: 'Production Inventory Report Summary',
    category: 'Production & Packing',
    description: 'Used by Production Inventory Report main header WhatsApp summary.',
    rows: 6,
    defaultTemplate: DEFAULT_PRODUCTION_INVENTORY_TEMPLATE,
    placeholders: [
      '{company}',
      '{title}',
      '{division}',
      '{department}',
      '{date}',
      '{total_items}',
      '{on_hand}',
      '{available}',
      '{total_in}',
      '{total_out}',
      '{produced}',
      '{required}',
      '{short_items}',
    ],
  },
  {
    key: 'productionInventoryBatch',
    code: '[PROD-INV-BATCH]',
    title: 'Production Inventory — Selected Batch Summary',
    category: 'Production & Packing',
    description: 'Used when sharing selected rows in Production Inventory Report.',
    rows: 6,
    defaultTemplate: DEFAULT_PRODUCTION_INVENTORY_BATCH_TEMPLATE,
    placeholders: ['{company}', '{division}', '{department}', '{date}', '{items_count}', '{items}'],
  },
  {
    key: 'productionMaterialFlow',
    code: '[PROD-FLOW]',
    title: 'Material Flow & Traceability Journey',
    category: 'Production & Packing',
    description: 'Used when sharing an item Material Flow & Stage Traceability Journey.',
    rows: 6,
    defaultTemplate: DEFAULT_PRODUCTION_MATERIAL_FLOW_TEMPLATE,
    placeholders: ['{company}', '{item_code}', '{item_name}', '{date}', '{stages}'],
  },
  {
    key: 'productionMultiDept',
    code: '[PROD-MULTI-DEPT]',
    title: 'Multi-Department Production & Stock Summary',
    category: 'Production & Packing',
    description: 'Used when sharing multi-department aggregated breakdown in Production Inventory.',
    rows: 6,
    defaultTemplate: DEFAULT_PRODUCTION_MULTI_DEPT_TEMPLATE,
    placeholders: ['{company}', '{division}', '{departments}', '{date}', '{department_rows}'],
  },
  {
    key: 'packingDailyProduction',
    code: '[PKG-DAILY]',
    title: 'Daily Packing Production & Dispatch Report',
    category: 'Production & Packing',
    description: 'Used by Packing Department Hub for daily packing batches & totals.',
    rows: 7,
    defaultTemplate: DEFAULT_PACKING_DAILY_REPORT_TEMPLATE,
    placeholders: [
      '{company}',
      '{date}',
      '{time}',
      '{division}',
      '{shift}',
      '{batches}',
      '{total_pcs}',
      '{total_gross}',
      '{total_cartons}',
      '{total_weight}',
      '{day_progress}',
    ],
  },
  {
    key: 'packingCustomerDispatch',
    code: '[PKG-CUST]',
    title: 'Customer Packed Finished Goods Dispatch Report',
    category: 'Production & Packing',
    description: 'Used by Packing Department Hub for customer-wise packed FG readiness.',
    rows: 7,
    defaultTemplate: DEFAULT_PACKING_CUSTOMER_DISPATCH_TEMPLATE,
    placeholders: [
      '{company}',
      '{date}',
      '{customer}',
      '{soc_line}',
      '{division}',
      '{items}',
      '{total_pcs}',
      '{total_gross}',
      '{total_cartons}',
      '{total_weight}',
      '{total_valuation}',
    ],
  },
  {
    key: 'packingFgrStock',
    code: '[PKG-FGR]',
    title: 'FGR Finished Goods Warehouse Stock Report',
    category: 'Production & Packing',
    description: 'Used by Packing Department Hub for live FGR Dispatch Warehouse stock.',
    rows: 7,
    defaultTemplate: DEFAULT_PACKING_FGR_STOCK_TEMPLATE,
    placeholders: [
      '{company}',
      '{warehouse}',
      '{date}',
      '{time}',
      '{items}',
      '{total_pcs}',
      '{total_gross}',
      '{total_cartons}',
      '{total_weight}',
      '{total_valuation}',
    ],
  },
  {
    key: 'packingNippleDeficit',
    code: '[PKG-NIP]',
    title: 'Pending Nipple Deficit & Safety Stock Report',
    category: 'Production & Packing',
    description: 'Used by Hand Packing Entry for Without-Nipple Safety Stock alerts.',
    rows: 7,
    defaultTemplate: DEFAULT_PACKING_NIPPLE_DEFICIT_TEMPLATE,
    placeholders: [
      '{company}',
      '{date}',
      '{department}',
      '{distinct_items}',
      '{waiting_batches}',
      '{total_pending_cartons}',
      '{total_pending_gross}',
      '{total_pending_pcs}',
      '{total_packed_weight}',
      '{items}',
    ],
  },

  // 5. Maintenance & Quality (QMS)
  {
    key: 'maintenanceJobCard',
    code: '[MNT-JC]',
    title: 'Maintenance Job Card Summary',
    category: 'Maintenance & Quality (QMS)',
    description: 'Used when dispatching or sharing a Maintenance Job Card ticket.',
    rows: 6,
    defaultTemplate: DEFAULT_JOB_CARD_WHATSAPP_TEMPLATE,
    placeholders: [
      '{company}',
      '{job_card_no}',
      '{status}',
      '{priority_line}',
      '{machine}',
      '{hierarchy_line}',
      '{location_line}',
      '{team_line}',
      '{complaint}',
      '{reported_by_line}',
      '{timings_section}',
      '{technicians_section}',
      '{parts_section}',
      '{actions_section}',
      '{generated_at}',
    ],
  },
  {
    key: 'qmsInspection',
    code: '[QMS-INSP]',
    title: 'QMS In-Process Quality Inspection Report',
    category: 'Maintenance & Quality (QMS)',
    description: 'Used when sharing an individual QMS In-Process Inspection report.',
    rows: 7,
    defaultTemplate: DEFAULT_QMS_INSPECTION_WHATSAPP_TEMPLATE,
    placeholders: [
      '{company}',
      '{doc_ref}',
      '{rev_no}',
      '{issue_date}',
      '{inspection_no}',
      '{division}',
      '{department}',
      '{date}',
      '{shift}',
      '{machine}',
      '{operator}',
      '{item_name}',
      '{item_code}',
      '{inspector}',
      '{approved_by_line}',
      '{samples_section}',
      '{attributes_section}',
      '{overall_result}',
      '{remarks}',
    ],
  },
  {
    key: 'qmsBatchSummary',
    code: '[QMS-BATCH]',
    title: 'QMS Batch Inspection Summary',
    category: 'Maintenance & Quality (QMS)',
    description: 'Used when sharing multiple selected QMS inspection records at once.',
    rows: 6,
    defaultTemplate: DEFAULT_QMS_BATCH_WHATSAPP_TEMPLATE,
    placeholders: [
      '{company}',
      '{date}',
      '{records_count}',
      '{passed_count}',
      '{failed_count}',
      '{items}',
    ],
  },

  // 6. AI Assistant & System
  {
    key: 'aiAnalyticsReport',
    code: '[AI-REPORT]',
    title: 'PWI AI Assistant & Analytics Report',
    category: 'AI Assistant & System',
    description: 'Used when sharing any PWI AI Assistant & Analytics report on WhatsApp.',
    rows: 6,
    defaultTemplate: DEFAULT_AI_REPORT_WHATSAPP_TEMPLATE,
    placeholders: ['{company}', '{title}', '{division}', '{department}', '{date}', '{items}', '{summary}'],
  },
  {
    key: 'mobileAppInstall',
    code: '[APP-INSTALL]',
    title: 'PWI ERP Mobile App Installation Link',
    category: 'AI Assistant & System',
    description: 'Used when sharing the PWI ERP mobile installation link via WhatsApp.',
    rows: 4,
    defaultTemplate: DEFAULT_MOBILE_APP_INSTALL_TEMPLATE,
    placeholders: ['{company}', '{link}'],
  },
];

/* Fast O(1) Lookup Maps by Template Key and `[CODE]` */
const REGISTRY_BY_KEY = new Map<string, WhatsAppTemplateDefinition>();
const REGISTRY_BY_CODE = new Map<string, WhatsAppTemplateDefinition>();

for (const def of WHATSAPP_TEMPLATE_REGISTRY) {
  REGISTRY_BY_KEY.set(def.key, def);
  REGISTRY_BY_CODE.set(def.code.toUpperCase(), def);
  REGISTRY_BY_CODE.set(def.code.replace(/^\[|\]$/g, '').toUpperCase(), def);
}

export function getWhatsAppTemplateDefinition(
  keyOrCode: string,
): WhatsAppTemplateDefinition | undefined {
  if (!keyOrCode) return undefined;
  return (
    REGISTRY_BY_KEY.get(keyOrCode) ||
    REGISTRY_BY_CODE.get(keyOrCode.trim().toUpperCase())
  );
}

export function buildDefaultWhatsAppTemplatesMap(): Record<WhatsAppTemplateKey, string> {
  const map = {} as Record<WhatsAppTemplateKey, string>;
  for (const def of WHATSAPP_TEMPLATE_REGISTRY) {
    map[def.key] = def.defaultTemplate;
  }
  return map;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * 0ms IN-MEMORY SESSION CACHE (Zero Network Calls, Zero Extra JSON.parse)
 * ──────────────────────────────────────────────────────────────────────────── */

let cachedRawJson: string | null | undefined = undefined;
let cachedSettings: StoredWhatsAppSettings = {};
let listenersAttached = false;

export function invalidateWhatsAppSettingsCache(): void {
  cachedRawJson = undefined;
}

function ensureCacheListeners(): void {
  if (listenersAttached || typeof window === 'undefined') return;
  listenersAttached = true;
  window.addEventListener(WHATSAPP_SETTINGS_UPDATED_EVENT, () => {
    cachedRawJson = undefined;
  });
  window.addEventListener('storage', (e: StorageEvent) => {
    if (!e.key || e.key === WHATSAPP_SETTINGS_STORAGE_KEY) {
      cachedRawJson = undefined;
    }
  });
}

/**
 * Reads WhatsApp settings from the 0ms in-memory session cache backed by
 * `localStorage['erp_whatsapp_settings_v1']`. Re-parses JSON ONLY when the
 * underlying serialized payload actually changes.
 */
export function readWhatsAppSettings(): StoredWhatsAppSettings {
  ensureCacheListeners();
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(WHATSAPP_SETTINGS_STORAGE_KEY);
      if (raw === cachedRawJson) {
        return cachedSettings;
      }
      cachedRawJson = raw;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          cachedSettings = parsed as StoredWhatsAppSettings;
          return cachedSettings;
        }
      }
      cachedSettings = {};
      return cachedSettings;
    }
  } catch {
    cachedRawJson = null;
    cachedSettings = {};
  }
  return cachedSettings;
}

/**
 * Saves WhatsApp Settings to `localStorage`, updates the 0ms in-memory cache
 * immediately, and notifies all mounted WhatsApp modals/previews.
 */
export function saveWhatsAppSettings(data: StoredWhatsAppSettings): void {
  ensureCacheListeners();
  const serialized = JSON.stringify(data);
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(WHATSAPP_SETTINGS_STORAGE_KEY, serialized);
  }
  dispatchWhatsAppSettingsUpdated();
  // Keep in-memory session cache warm after notifying listeners (0 JSON.parse on subsequent reads)
  cachedRawJson = serialized;
  cachedSettings = data;
}

/** Dispatches a live event so open WhatsApp modals refresh immediately without reloading the page. */
export function dispatchWhatsAppSettingsUpdated(): void {
  cachedRawJson = undefined;
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(WHATSAPP_SETTINGS_UPDATED_EVENT));
  } catch {
    // Ignore if CustomEvent unavailable
  }
}

/**
 * Resolves a saved non-empty WhatsApp template from Settings -> WhatsApp Messages
 * by either `key` (e.g. `'rmReceipt'`) or `code` (e.g. `'[RM-GP]'` / `'RM-GP'`),
 * falling back to `defaultTemplate` or the registered default template.
 */
export function resolveWhatsAppTemplate(
  keyOrCode: string,
  defaultTemplate?: string,
): string {
  const def = getWhatsAppTemplateDefinition(keyOrCode);
  const canonicalKey = def ? def.key : keyOrCode;
  const settings = readWhatsAppSettings();
  const saved =
    settings.templates?.[canonicalKey] ??
    (def ? settings.templates?.[def.code] : undefined);
  if (typeof saved === 'string' && saved.trim().length > 0) {
    return saved.trim();
  }
  if (defaultTemplate !== undefined) {
    return defaultTemplate;
  }
  return def ? def.defaultTemplate : '';
}

/**
 * Replaces `{placeholder}` tokens cleanly without `$` regex replacement bugs.
 * Accepts BOTH `{ '{customer}': 'ABC' }` and `{ customer: 'ABC' }` token keys!
 * Also accepts either a registered template code/key (e.g. `'[RM-GP]'`, `'rmReceipt'`)
 * OR a raw template string for 100% backwards compatibility.
 */
export function renderWhatsAppTemplate(
  templateOrKeyOrCode: string,
  replacements: Record<string, string | number | undefined | null>,
  caseInsensitive = false,
): string {
  // Check if the caller passed a registered key or [CODE] directly
  const registeredDef =
    !templateOrKeyOrCode.includes('\n') && !templateOrKeyOrCode.includes('{')
      ? getWhatsAppTemplateDefinition(templateOrKeyOrCode)
      : undefined;

  let out = registeredDef
    ? resolveWhatsAppTemplate(registeredDef.key, registeredDef.defaultTemplate)
    : templateOrKeyOrCode;

  for (const [rawKey, rawVal] of Object.entries(replacements)) {
    const value = rawVal === undefined || rawVal === null ? '' : String(rawVal);
    const bracedToken = rawKey.startsWith('{') && rawKey.endsWith('}') ? rawKey : `{${rawKey}}`;
    if (!caseInsensitive) {
      out = out.split(bracedToken).join(value);
    } else {
      const escaped = bracedToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(escaped, 'gi'), () => value);
    }
  }

  // Collapse 3+ consecutive blank lines caused by empty optional blocks into at most 2 newlines
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/** Renders a repeating list of items using a registered or custom line sub-template. */
export function renderWhatsAppRepeatingLines(
  lineTemplateKeyOrRaw: string,
  rows: Array<Record<string, string | number | undefined | null>>,
  joinWith = '\n\n',
): string {
  if (!rows || rows.length === 0) return '';
  const def =
    !lineTemplateKeyOrRaw.includes('\n') && !lineTemplateKeyOrRaw.includes('{')
      ? getWhatsAppTemplateDefinition(lineTemplateKeyOrRaw)
      : undefined;
  const lineTpl = def
    ? resolveWhatsAppTemplate(def.key, def.defaultTemplate)
    : lineTemplateKeyOrRaw;

  return rows
    .map((row) => renderWhatsAppTemplate(lineTpl, row))
    .filter(Boolean)
    .join(joinWith);
}

/** Returns the configured country code digits from Settings -> WhatsApp Messages (default: '92'). */
export function getWhatsAppCountryCode(fallback = '92'): string {
  const settings = readWhatsAppSettings();
  const digits = String(settings.countryCode || fallback).replace(/\D/g, '');
  return digits || fallback;
}

/** Applies the saved Settings country code to local `03xx...` phone numbers. */
export function formatWhatsAppPhoneWithCountryCode(phone?: string): string {
  const cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : '';
  if (!cleanPhone) return '';
  if (cleanPhone.startsWith('0')) {
    return `${getWhatsAppCountryCode()}${cleanPhone.slice(1)}`;
  }
  return cleanPhone;
}

/** Builds a WhatsApp share URL (`api.whatsapp.com/send`) with optional recipient phone. */
export function buildWhatsAppShareUrl(text: string, phone?: string): string {
  const formattedPhone = formatWhatsAppPhoneWithCountryCode(phone);
  const encodedText = encodeURIComponent((text || '').trim());
  return formattedPhone.length >= 8
    ? `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodedText}`
    : `https://api.whatsapp.com/send?text=${encodedText}`;
}

/** Copies message to clipboard (best-effort) and opens WhatsApp in a new tab. */
export function openWhatsAppWithTemplate(
  templateCodeOrKey: string,
  replacements: Record<string, string | number | undefined | null>,
  phone?: string,
): string {
  const text = renderWhatsAppTemplate(templateCodeOrKey, replacements);
  if (!text) return '';
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  } catch {
    // Ignore clipboard errors
  }
  const url = buildWhatsAppShareUrl(text, phone);
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  return text;
}

/** React hook that increments whenever Settings -> WhatsApp Messages saves changes (same tab or cross-tab). */
export function useWhatsAppSettingsVersion(): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => {
      cachedRawJson = undefined;
      setVersion((v) => v + 1);
    };
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === WHATSAPP_SETTINGS_STORAGE_KEY) bump();
    };
    window.addEventListener(WHATSAPP_SETTINGS_UPDATED_EVENT, bump);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(WHATSAPP_SETTINGS_UPDATED_EVENT, bump);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return version;
}
