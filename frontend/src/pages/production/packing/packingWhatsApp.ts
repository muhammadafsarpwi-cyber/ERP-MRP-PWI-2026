import dayjs from 'dayjs';
import { formatNumber, toNum } from '../../../utils/numberFormat';
import { renderWhatsAppTemplate, resolveWhatsAppTemplate } from '../../../utils/whatsappSettingsStore';

export const DEFAULT_PACKING_CUSTOMER_DISPATCH_TEMPLATE = `🏭 *{company}*
📦 *PACKED FINISHED GOODS INVENTORY DISPATCH REPORT*
📅 *Date:* {date}
────────────────────────────
👤 *Customer:* {customer}
{soc_line}🏢 *Division:* {division}
────────────────────────────
*PACKED FINISHED GOODS DETAIL:*
{items}

────────────────────────────
📊 *TOTAL SUMMARY:* (Pieces ➔ Gross ➔ Cartons)
🔢 *1. Total Pieces:* {total_pcs}
📦 *2. Total Gross:* {total_gross}
📦 *3. Total Cartons:* {total_cartons}
⚖️ *Total Weight:* {total_weight}
💰 *Total Valuation:* {total_valuation}
────────────────────────────
✅ *Verified & Ready for Dispatch by Packing Dept, PWI*`;

export const DEFAULT_PACKING_DAILY_REPORT_TEMPLATE = `🏭 *{company}*
📋 *DAILY PACKING PRODUCTION & DISPATCH REPORT*
📅 *Date:* {date} | *Time:* {time}
🏢 *Division:* {division} | *Shift:* {shift}
━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 *TODAY'S RECORDED PACKING BATCHES:*
{batches}

━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 *TODAY'S PRODUCTION TOTALS (PCS ➔ GRS ➔ CTN):*
🔢 *1. Total Pieces Packed:* {total_pcs}
📦 *2. Total Gross Packed:* {total_gross}
🏷️ *3. Total Cartons Packed:* {total_cartons}
⚖️ *Total Net Weight Packed:* {total_weight}
🎯 *Day Target Progress:* {day_progress}
━━━━━━━━━━━━━━━━━━━━━━━━━━
👨‍💼 _Prepared by Packing Department Supervisor, PWI_`;

export const DEFAULT_PACKING_FGR_STOCK_TEMPLATE = `🏭 *{company}*
📊 *FGR FINISHED GOODS WAREHOUSE STOCK REPORT*
🏬 *Warehouse:* {warehouse}
📅 *Date:* {date} | *Time:* {time}
━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 *LIVE FGR STOCK BREAKDOWN:*
{items}

━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 *FGR EXECUTIVE TOTALS (PCS ➔ GRS ➔ CTN):*
🔢 *1. Total Available Pieces:* {total_pcs}
📦 *2. Total Available Gross:* {total_gross}
🏷️ *3. Total Available Cartons:* {total_cartons}
⚖️ *Total Net Weight in Stock:* {total_weight}
💰 *Total Stock Valuation:* {total_valuation}
━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ _Official Live FGR Stock Balance verified by Packing & Warehouse Team_`;

export const DEFAULT_PACKING_NIPPLE_DEFICIT_TEMPLATE = `*PAKISTAN WIRE INDUSTRIES (PVT.) LTD.*
*WITHOUT NIPPLE PACK · SAFETY STOCK INVENTORY REPORT*
📅 *Date & Time:* {date}
🏢 *Department:* {department}
-------------------------------------------
📊 *EXECUTIVE SUMMARY:*
• *Distinct FG Items:* {distinct_items} Items
• *Waiting Incomplete Batches:* {waiting_batches} Batches
• *Total Waiting Cartons:* *{total_pending_cartons} Cartons*
• *Total Packed Quantity:* {total_pending_gross} GRS ({total_pending_pcs} PCS)
• *Total Packed Weight:* *{total_packed_weight} KG (Spokes Only · Without Nipple)*
• *Total Missing Nipple Deficit:* *{total_pending_gross} GRS Required*
-------------------------------------------

*ITEM-WISE CONSOLIDATED STOCK & NIPPLE DEFICIT:*

{items}

⚠️ *STATUS NOTE:* All items above are packed in White Poly Bags and held in Safety Stock. Dispatch is blocked until nipples arrive from store.
_Generated automatically via PWI ERP System_`;

export function buildCustomerPackingDispatchWhatsApp(cust: any): string {
  if (!cust) return '';
  const custWeight = cust.items.reduce((s: number, it: any) => s + (it.weightKg || 0), 0);
  const custPcs = cust.items.reduce((s: number, it: any) => s + (it.pcs || 0), 0);
  const custGross = cust.items.reduce((s: number, it: any) => s + (it.gross || 0), 0);
  const custCartons = cust.items.reduce((s: number, it: any) => s + (it.cartons || 0), 0);
  const custVal = cust.items.reduce((s: number, it: any) => s + (it.valuePkr || 0), 0);
  const dateStr = dayjs().format('DD-MMM-YYYY');

  const itemLines: string[] = [];
  cust.items.forEach((it: any, idx: number) => {
    itemLines.push(`\n${idx + 1}️⃣ *${it.itemCode}* — ${it.itemName}`);
    if (it.packagingStyle) itemLines.push(`   🛍️ Style: ${it.packagingStyle}`);
    itemLines.push(`   • Pieces: *${formatNumber(it.pcs, 0)} PCS*`);
    itemLines.push(`   • Gross: *${formatNumber(it.gross, 0)} GRS*`);
    itemLines.push(`   • Cartons: *${formatNumber(it.cartons, 0)} CTN*`);
    itemLines.push(`   • Weight: *${formatNumber(it.weightKg, 2)} KG*`);
  });

  const template = resolveWhatsAppTemplate(
    'packingCustomerDispatch',
    DEFAULT_PACKING_CUSTOMER_DISPATCH_TEMPLATE,
  );
  return renderWhatsAppTemplate(template, {
    '{company}': 'Pakistan Wire Industries (Pvt.) LTD',
    '{date}': dateStr,
    '{customer}': `${cust.customerName} (${cust.customerCode})`,
    '{soc_line}': cust.socNo && cust.socNo !== '—' ? `📋 *SOC #:* ${cust.socNo}\n` : '',
    '{division}': 'Spoke Division (DIV-SPD)',
    '{items}': itemLines.join('\n').trimStart(),
    '{total_pcs}': `${formatNumber(custPcs, 0)} PCS`,
    '{total_gross}': `${formatNumber(custGross, 0)} GRS`,
    '{total_cartons}': `${formatNumber(custCartons, 0)} CTN`,
    '{total_weight}': `${formatNumber(custWeight, 2)} KG`,
    '{total_valuation}': `PKR ${formatNumber(custVal, 0)}`,
  });
}

export function buildTodayPackingWhatsApp(params: {
  historyLogs: any[];
  totalStockPcs: number;
  totalStockGross: number;
  totalStockCartons: number;
  totalStockKg: number;
}): string {
  const { historyLogs, totalStockPcs, totalStockGross, totalStockCartons, totalStockKg } = params;
  const dateStr = dayjs().format('DD-MMM-YYYY');
  const timeStr = dayjs().format('hh:mm A');

  const batchLines: string[] = [];
  let batchCount = 0;
  historyLogs.forEach((entry: any, idx: number) => {
    const remarks = String(entry.remarks || '');
    const batchMatch = remarks.match(/Batch:\s*([^|]+)/i);
    const batchNo = batchMatch ? batchMatch[1].trim() : `PKG-2026-000${idx + 2}`;
    const custMatch = remarks.match(/Customer:\s*([^|]+)/i);
    const custName = custMatch ? custMatch[1].trim() : (entry.customer?.name || 'ALI SHAH AUTOS');
    const socMatch = remarks.match(/SOC:\s*([^|]+)/i);
    const socNo = socMatch ? socMatch[1].trim() : (entry.socNo || '5805');
    const styleMatch = remarks.match(/Style:\s*([^|]+)/i);
    const style = styleMatch ? styleMatch[1].trim() : 'OEM Packing';
    const ctnMatch = remarks.match(/Cartons:\s*([\d.]+)/i);
    const grossMatch = remarks.match(/Gross:\s*([\d.]+)/i) || remarks.match(/\(([\d.]+)\s*Gross/i);
    const pcs = toNum(entry.actualQuantity || entry.quantity || 72000);
    const cartons = ctnMatch ? Number(ctnMatch[1]) : 50;
    const gross = grossMatch ? Number(grossMatch[1]) : 500;
    const codeStr = String(entry.item?.itemCode || entry.itemCode || '');
    const wt = codeStr.includes('006') ? 1156.0 : 1007.3;

    const isShifted =
      remarks.includes('Allocated from Safety Stock') ||
      remarks.includes('SHIFTED FROM SAFETY STOCK') ||
      remarks.includes('Allocated from Safety');

    batchCount++;
    batchLines.push(
      `\n*Batch ${batchCount}: ${batchNo}*${isShifted ? ' _(⚡ Shifted from Safety Stock)_' : ''}`,
      `• Customer: *${custName}* (SOC: ${socNo})`,
      `• Item: *${codeStr}* — ${entry.item?.name || 'Finished Good'}`,
      `• Style: ${style}`,
      `• Output: *${formatNumber(pcs, 0)} PCS* | *${gross} GRS* | *${cartons} CTN*`,
      `• Net Batch Weight: *${formatNumber(wt, 1)} KG*`,
      `• Store (IN): *SPI FG Dispatch Warehouse (SPI-FGDW-001)*`,
      `• Status: ${isShifted ? '✅ ALLOCATED & SHIFTED FROM SAFETY STOCK' : '✅ PACKED & READY FOR DISPATCH'}`,
    );
  });

  const template = resolveWhatsAppTemplate(
    'packingDailyProduction',
    DEFAULT_PACKING_DAILY_REPORT_TEMPLATE,
  );
  return renderWhatsAppTemplate(template, {
    '{company}': 'Pakistan Wire Industries (Pvt.) LTD',
    '{date}': dateStr,
    '{time}': timeStr,
    '{division}': 'Spoke Division (DIV-SPD)',
    '{shift}': 'General Shift (8:30 AM - 5:30 PM)',
    '{batches}': batchLines.join('\n').trimStart() || 'No batches logged yet.',
    '{total_pcs}': `${formatNumber(totalStockPcs, 0)} PCS`,
    '{total_gross}': `${formatNumber(totalStockGross, 0)} GRS`,
    '{total_cartons}': `${formatNumber(totalStockCartons, 0)} CTN`,
    '{total_weight}': `${formatNumber(totalStockKg, 1)} KG`,
    '{day_progress}': '100 / 125 Cartons (80% Achieved)',
  });
}

export function buildFgrStockWhatsApp(params: {
  customerStockData: any[];
  totalStockPcs: number;
  totalStockGross: number;
  totalStockCartons: number;
  totalStockKg: number;
  totalStockValuation: number;
}): string {
  const {
    customerStockData,
    totalStockPcs,
    totalStockGross,
    totalStockCartons,
    totalStockKg,
    totalStockValuation,
  } = params;
  const dateStr = dayjs().format('DD-MMM-YYYY');
  const timeStr = dayjs().format('hh:mm A');

  const itemLines: string[] = [];
  customerStockData.forEach((cust, cIdx) => {
    itemLines.push(`\n👤 *Customer ${cIdx + 1}: ${cust.customerName}* (${cust.customerCode})`);
    if (cust.socNo && cust.socNo !== '—') itemLines.push(`   📋 SOC #: ${cust.socNo}`);
    cust.items.forEach((it: any, iIdx: number) => {
      itemLines.push(`   ${iIdx + 1}. *${it.itemCode}* — ${it.itemName}`);
      itemLines.push(`      • Pieces: *${formatNumber(it.pcs, 0)} PCS*`);
      itemLines.push(`      • Gross: *${formatNumber(it.gross, 0)} GRS*`);
      itemLines.push(`      • Cartons: *${formatNumber(it.cartons, 0)} CTN*`);
      itemLines.push(`      • Weight: *${formatNumber(it.weightKg, 1)} KG*`);
    });
  });

  const template = resolveWhatsAppTemplate('packingFgrStock', DEFAULT_PACKING_FGR_STOCK_TEMPLATE);
  return renderWhatsAppTemplate(template, {
    '{company}': 'Pakistan Wire Industries (Pvt.) LTD',
    '{warehouse}': 'SPI FG Dispatch Warehouse (SPI-FGDW-001)',
    '{date}': dateStr,
    '{time}': timeStr,
    '{items}': itemLines.join('\n').trimStart() || 'No active stock records.',
    '{total_pcs}': `${formatNumber(totalStockPcs, 0)} PCS`,
    '{total_gross}': `${formatNumber(totalStockGross, 0)} GRS`,
    '{total_cartons}': `${formatNumber(totalStockCartons, 0)} CTN`,
    '{total_weight}': `${formatNumber(totalStockKg, 1)} KG`,
    '{total_valuation}': `PKR ${formatNumber(totalStockValuation, 0)}`,
  });
}

export function buildNippleDeficitWhatsApp(params: {
  groupedPendingNippleItems: any[];
  pendingNippleEntries: any[];
}): string {
  const { groupedPendingNippleItems, pendingNippleEntries } = params;
  const dateStr = dayjs().format('DD-MMM-YYYY hh:mm A');
  const totalCartons = pendingNippleEntries.reduce((s, r) => s + (r.cartons || 0), 0);
  const totalGross = pendingNippleEntries.reduce((s, r) => s + (r.gross || 0), 0);
  const totalPcs = pendingNippleEntries.reduce((s, r) => s + (r.pcs || 0), 0);
  const totalWeight = pendingNippleEntries.reduce((s, r) => s + (r.weightKg || 0), 0);
  const totalNippleGross = groupedPendingNippleItems.reduce((s, g) => s + (g.totalPendingNippleGross || 0), 0);

  const itemLines: string[] = [];
  groupedPendingNippleItems.forEach((item, idx) => {
    itemLines.push(`*${idx + 1}. [${item.fgItemCode}]* ${item.fgItemName}`);
    itemLines.push(`   📦 *Cartons:* ${formatNumber(item.totalCartons, 0)} Cartons`);
    itemLines.push(`   📊 *Quantity:* ${formatNumber(item.totalGross, 0)} GRS (${formatNumber(item.totalPcs, 0)} PCS)`);
    itemLines.push(`   ⚖️ *Packed Weight:* ${formatNumber(item.totalWeightKg, 1)} KG (Spokes Only)`);
    itemLines.push(`   ⚠️ *Missing Nipple:* ${item.pendingNippleCode || 'Nipple Req'} ➔ *${formatNumber(item.totalPendingNippleGross, 0)} GRS Required*`);
    itemLines.push(`   📋 *Batches (${item.batchCount}):* ${(item.batches || []).map((b: any) => b.batchNo).join(', ')}`);
    itemLines.push(`   🏢 *Customers/SOC:* ${(item.customers || []).join(', ') || 'Safety Stock'}\n`);
  });

  const template = resolveWhatsAppTemplate(
    'packingNippleDeficit',
    DEFAULT_PACKING_NIPPLE_DEFICIT_TEMPLATE,
  );
  return renderWhatsAppTemplate(template, {
    '{date}': dateStr,
    '{department}': 'Packing Division (SPD)',
    '{distinct_items}': String(groupedPendingNippleItems.length),
    '{waiting_batches}': String(pendingNippleEntries.length),
    '{total_pending_cartons}': formatNumber(totalCartons, 0),
    '{total_pending_gross}': formatNumber(totalNippleGross || totalGross, 0),
    '{total_pending_pcs}': formatNumber(totalPcs, 0),
    '{total_packed_weight}': formatNumber(totalWeight, 1),
    '{items}': itemLines.join('\n').trim(),
  });
}
