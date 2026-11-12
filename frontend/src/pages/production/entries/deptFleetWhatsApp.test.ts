import { buildDepartmentFleetWhatsAppText, MachineStatusRow } from './deptFleetWhatsApp';

describe('deptFleetWhatsApp', () => {
  const sampleMachines: MachineStatusRow[] = [
    {
      id: 'm-1',
      systemCode: 'MCH-01',
      machineCode: 'ST-01',
      name: 'Straightener Machine 01',
      status: 'ENTERED',
      entryCount: 1,
      divisionId: 'div-1',
      sectionId: 'sec-1',
      departmentId: 'dept-st',
      departmentName: 'Straightener',
      targetQuantity: 63000,
      actualQuantity: 44001,
      variance: -18999,
      achievementPercentage: 69.84,
      uom: 'PCS',
      entries: [
        {
          id: 'e-1',
          itemId: 'i-1',
          itemCode: 'CD-250*17 Butted',
          itemName: 'CD-250*17 Butted',
          targetQuantity: 63000,
          actualQuantity: 44001,
          uom: 'PCS',
        },
      ],
    },
    {
      id: 'm-2',
      systemCode: 'MCH-02',
      machineCode: 'ST-02',
      name: 'Straightener Machine 02',
      status: 'ENTERED',
      entryCount: 1,
      divisionId: 'div-1',
      sectionId: 'sec-1',
      departmentId: 'dept-st',
      departmentName: 'Straightener',
      targetQuantity: 74400,
      actualQuantity: 49509,
      variance: -24891,
      achievementPercentage: 66.54,
      uom: 'PCS',
      entries: [
        {
          id: 'e-2',
          itemId: 'i-2',
          itemCode: 'S9-300*17 Inner Straight',
          itemName: 'S9-300*17 Inner Straight',
          targetQuantity: 74400,
          actualQuantity: 49509,
          uom: 'PCS',
        },
      ],
    },
    {
      id: 'm-3',
      systemCode: 'MCH-03',
      machineCode: 'ST-03',
      name: 'Straightener Machine 03',
      status: 'ENTRY_REQUIRED',
      entryCount: 0,
      divisionId: 'div-1',
      sectionId: 'sec-1',
      departmentId: 'dept-st',
      departmentName: 'Straightener',
      targetQuantity: 72960,
      actualQuantity: 0,
      variance: -72960,
      achievementPercentage: 0,
      uom: 'PCS',
      entries: [],
    },
  ];

  it('builds a correctly formatted WhatsApp report for Straightener department', () => {
    const text = buildDepartmentFleetWhatsAppText({
      department: {
        id: 'dept-st',
        name: 'Straightener',
        departmentCode: 'ST',
      },
      divisionName: 'Spoke Division',
      shiftName: 'General Shift (D)',
      shiftTiming: '08:00 - 17:00',
      dateStr: '2026-11-05',
      machines: sampleMachines,
    });

    expect(text).toContain('PAKISTAN WIRE INDUSTRIES (PVT.) LTD');
    expect(text).toContain('STRAIGHTENER');
    expect(text).toContain('05-Nov-2026');
    expect(text).toContain('General Shift (D)');
    expect(text).toContain('ST-01 — Straightener Machine 01');

    // Target and Shortage should NOT be present in machine rows
    expect(text).not.toContain('*Target:* 63,000 PCS');
    expect(text).not.toContain('*Shortage:*');

    // Actual, Achievement, Items should be present
    expect(text).toContain('*Actual:* 44,001 PCS');
    expect(text).toContain('*Achievement:* 69.84% 🔴 ▼');
    expect(text).toContain('* CD-250*17 Butted (44,001 PCS)');
    expect(text).toContain('[Entered]');
    expect(text).not.toContain('✅');
    expect(text).not.toContain('📦 *Actual:*');
    expect(text).not.toContain('📊 *Achievement:*');

    // Check totals
    expect(text).toContain('STRAIGHTENER TOTALS:');
    expect(text).toContain('*Total Machines:* 3 Machines (2 Entered / 1 Pending)');
    // Sum actual: 44001 + 49509 + 0 = 93,510
    expect(text).toContain('*Total Production:* *93,510 PCS*');
    expect(text).toContain('*Overall Achievement:* *44.45% 🔴 ▼*');

    // Check item-wise total summary
    expect(text).toContain('ITEM-WISE TOTAL SUMMARY:');
    expect(text).toContain('*CD-250*17 Butted:* *44,001 PCS*');
    expect(text).toContain('*S9-300*17 Inner Straight:* *49,509 PCS*');
  });

  it('correctly sets divisionName and optional sectionName', () => {
    const text = buildDepartmentFleetWhatsAppText({
      department: {
        id: 'dept-spk',
        name: 'Spoke Plating',
        departmentCode: 'SPL',
      },
      divisionName: 'Spoke Division (DIV-SPD)',
      sectionName: 'Auto Plating Section',
      shiftName: 'General Shift (D+OT)',
      shiftTiming: '08:30:00 - 20:30:00',
      dateStr: '2026-11-11',
      machines: sampleMachines,
    });

    expect(text).toContain('*Division:* *Spoke Division (DIV-SPD)*');
    expect(text).toContain('*Section:* *Auto Plating Section*');
    expect(text).not.toContain('*Division:* *Auto Plating Section*');
  });

  it('applies custom template configured in Settings > WhatsApp Messages', () => {
    const customTemplate = `*CUSTOM REPORT: {department}*
Date: {date}
Division: {division}
Total: {total_production}
Overall Achievement: {overall_achievement}
{machine_rows}`;

    localStorage.setItem(
      'erp_whatsapp_settings_v1',
      JSON.stringify({
        templates: {
          dailyProductionFleet: customTemplate,
        },
      })
    );

    const text = buildDepartmentFleetWhatsAppText({
      department: {
        id: 'dept-st',
        name: 'Straightener',
        departmentCode: 'ST',
      },
      divisionName: 'Spoke Division (DIV-SPD)',
      shiftName: 'General Shift (D)',
      dateStr: '2026-11-05',
      machines: sampleMachines,
    });

    expect(text).toContain('*CUSTOM REPORT: STRAIGHTENER*');
    expect(text).toContain('Date: 05-Nov-2026');
    expect(text).toContain('Division: Spoke Division (DIV-SPD)');
    expect(text).toContain('Total: 93,510 PCS');
    expect(text).toContain('Overall Achievement: 44.45% 🔴 ▼');
    expect(text).toContain('ST-01 — Straightener Machine 01');

    localStorage.removeItem('erp_whatsapp_settings_v1');
  });
});
