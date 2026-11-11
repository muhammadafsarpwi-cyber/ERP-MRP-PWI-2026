const fs = require('fs');
const path = 'backend/src/modules/production/services/production-entry.service.ts';
let code = fs.readFileSync(path, 'utf8');

const targetStr = `  async completePendingNippleBatch(
    entryId: string,
    dto: { warehouseId?: string; completionDate?: string },
    companyId: string,
    userId?: string,
  ) {`;

const newCode = `  async completePendingNippleBatch(
    entryId: string,
    dto: { warehouseId?: string; completionDate?: string; completedCartons?: number },
    companyId: string,
    userId?: string,
  ) {
    const entry = await this.entryRepo.findOne({
      where: { id: entryId, companyId },
    });
    if (!entry) {
      throw new NotFoundException(\`Production entry \${entryId} not found\`);
    }

    const remarks = entry.remarks || '';
    const match =
      remarks.match(/Pending Nipple:\\s*([A-Za-z0-9_-]+)\\s*\\(([\\d.]+)\\s*GRS\\s*(?:\\/\\s*([\\d.]+)\\s*PCS)?\\)/i) ||
      remarks.match(/Without Nipple:\\s*([A-Za-z0-9_-]+)\\s*\\(([\\d.]+)\\s*GRS/i);

    const ctnMatch = remarks.match(/Cartons:\\s*(\\d+(?:\\.\\d+)?)/i);
    const totalCartons = ctnMatch ? parseFloat(ctnMatch[1]) : 0;
    const requestedCartons = Number(dto.completedCartons || 0);
    const isPartial = totalCartons > 0 && requestedCartons > 0 && requestedCartons < totalCartons;
    const completedCartons = isPartial ? requestedCartons : totalCartons;
    const ratio = totalCartons > 0 ? (completedCartons / totalCartons) : 1;

    const completionDateStr = dto.completionDate || new Date().toISOString().slice(0, 10);
    const targetWhId = dto.warehouseId || 'cf5c9db8-5e84-41d5-a4b4-988b8dfd122d'; // Dedicated WH-002 SPI Nipple Packing Warehouse

    let totalPendingGross = 0;
    let totalPendingPcs = 0;
    let deductedPcs = 0;
    let deductedGross = 0;
    let nippleItemCode = '';

    if (match) {
      nippleItemCode = match[1].trim();
      totalPendingGross = parseFloat(match[2]) || 0;
      totalPendingPcs = match[3] ? parseFloat(match[3]) : Math.round(totalPendingGross * 144);

      deductedGross = Math.round((totalPendingGross * ratio) * 100) / 100;
      deductedPcs = Math.round(totalPendingPcs * ratio);

      const item = await this.itemRepo.findOne({
        where: [{ itemCode: nippleItemCode, companyId }, { itemCode: nippleItemCode }],
        relations: ['baseUom'],
      });

      if (item && deductedPcs > 0) {
        await this.inventoryBalanceService.updateBalance(
          companyId,
          item.id,
          targetWhId,
          null,
          null,
          item.baseUomId,
          deductedPcs,
          'OUT',
        );

        await this.stockLedgerService.create({
          companyId,
          transactionType: 'PRODUCTION_CONSUMPTION',
          transactionDate: new Date(completionDateStr),
          itemId: item.id,
          warehouseId: targetWhId,
          quantity: deductedPcs,
          uomId: item.baseUomId,
          direction: 'OUT',
          referenceType: 'PRODUCTION_ENTRY',
          referenceId: entry.id,
          referenceNumber: entry.entryNumber ?? undefined,
          notes: isPartial
            ? \`Nipple stock issued for Batch \${entry.entryNumber} partial completion (\${completedCartons} of \${totalCartons} Cartons: \${deductedGross} GRS / \${deductedPcs} PCS) from WH-002 SPI Nipple Packing Warehouse\`
            : \`Nipple stock issued for Batch \${entry.entryNumber} completion (\${deductedGross} GRS / \${deductedPcs} PCS) from WH-002 SPI Nipple Packing Warehouse\`,
          createdBy: userId,
        });
      }
    }

    if (isPartial) {
      const remainingCartons = Math.round((totalCartons - completedCartons) * 100) / 100;
      const remainingGross = Math.round((totalPendingGross - deductedGross) * 100) / 100;
      const remainingPcs = Math.round(totalPendingPcs - deductedPcs);

      entry.actualQuantity = String(remainingPcs);
      let updatedRemarks = remarks
        .replace(/Cartons:\\s*\\d+(?:\\.\\d+)?/i, \`Cartons: \${remainingCartons}\`)
        .replace(/\\(\\s*[\\d.]+\\s*Gross/i, \`(\${remainingGross} Gross\`)
        .replace(/Without Nipple:[^|]+/gi, \`Without Nipple: \${nippleItemCode} (\${remainingGross} GRS) \`)
        .replace(/Pending Nipple:[^|]+/gi, \`Pending Nipple: \${nippleItemCode} (\${remainingGross} GRS / \${remainingPcs} PCS) \`)
        .trim();
      updatedRemarks += \` | Partial Completed: \${completionDateStr} (\${completedCartons} of \${totalCartons} CTN completed with nipples, \${remainingCartons} CTN remaining in Safety Stock)\`;
      entry.remarks = updatedRemarks;
      await this.entryRepo.save(entry);

      const completedEntry = this.entryRepo.create({
        companyId: entry.companyId,
        entryNumber: await this.generateEntryNumber(companyId),
        productionOrderId: entry.productionOrderId,
        productionOrderOperationId: entry.productionOrderOperationId,
        divisionId: entry.divisionId,
        sectionId: entry.sectionId,
        departmentId: entry.departmentId,
        entryDate: entry.entryDate,
        shiftId: entry.shiftId,
        machineId: entry.machineId,
        machineNo: entry.machineNo,
        operatorName: entry.operatorName,
        supervisorName: entry.supervisorName,
        coilSize: entry.coilSize,
        itemId: entry.itemId,
        uomId: entry.uomId,
        targetQuantity: Math.round(Number(entry.targetQuantity || 0) * ratio),
        actualQuantity: String(deductedPcs),
        packingMode: 'FULL_SET',
        rawMaterialWarehouseId: entry.rawMaterialWarehouseId,
        warehouseId: entry.warehouseId,
        remarks: remarks
          .replace(/Cartons:\\s*\\d+(?:\\.\\d+)?/i, \`Cartons: \${completedCartons}\`)
          .replace(/\\(\\s*[\\d.]+\\s*Gross[^\\)]*\\)/i, \`(\${deductedGross} Gross / \${deductedPcs} PCS)\`)
          .replace(/Status:\\s*WITHOUT_NIPPLE/gi, 'Status: COMPLETED')
          .replace(/SpokePackingMode:\\s*WITHOUT_NIPPLE/gi, 'SpokePackingMode: FULL_SET')
          .replace(/\\|?\\s*Without Nipple:[^|]+/gi, '')
          .replace(/\\|?\\s*Pending Nipple:[^|]+/gi, '')
          .trim() + \` | Nipple Stock Deducted: \${completionDateStr} (\${deductedGross} GRS / \${deductedPcs} PCS from WH-002) | Partial Completion from \${entry.entryNumber} (\${completedCartons} of \${totalCartons} CTN) | Completed by User\`,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      });
      await this.entryRepo.save(completedEntry);

      return {
        success: true,
        message: \`Partial batch completed! \${completedCartons} Cartons finalized with \${deductedGross} GRS (\${deductedPcs.toLocaleString()} PCS) of nipple \${nippleItemCode} deducted from WH-002. Remaining \${remainingCartons} Cartons remain in Safety Stock.\`,
        isPartial: true,
        completedCartons,
        remainingCartons,
        deductedPcs,
        deductedGross,
        nippleItemCode,
      };
    } else {
      const cleanRemarks = remarks
        .replace(/Status:\\s*WITHOUT_NIPPLE/gi, 'Status: COMPLETED')
        .replace(/SpokePackingMode:\\s*WITHOUT_NIPPLE/gi, 'SpokePackingMode: FULL_SET')
        .replace(/\\|?\\s*Without Nipple:[^|]+/gi, '')
        .replace(/\\|?\\s*Pending Nipple:[^|]+/gi, '')
        .trim() + \` | Nipple Stock Deducted: \${completionDateStr} (\${deductedGross} GRS / \${deductedPcs} PCS from WH-002) | Completed by User\`;

      entry.remarks = cleanRemarks;
      entry.packingMode = 'FULL_SET';
      await this.entryRepo.save(entry);

      return {
        success: true,
        message: \`Batch completed successfully! \${deductedGross} GRS (\${deductedPcs.toLocaleString()} PCS) of nipple \${nippleItemCode} deducted from SPI Nipple Packing Warehouse (WH-002).\`,
        isPartial: false,
        completedCartons: totalCartons,
        deductedPcs,
        deductedGross,
        nippleItemCode,
      };
    }
  }`;

// Find end of completePendingNippleBatch (line 4556)
const startIdx = code.indexOf('async completePendingNippleBatch');
const endIdx = code.indexOf('export async function getOperatorDailySummary');
if (startIdx !== -1 && endIdx !== -1) {
  code = code.substring(0, startIdx) + newCode + '\n}\n\n/**\n' + code.substring(endIdx);
  fs.writeFileSync(path, code, 'utf8');
  console.log('SUCCESS: Updated completePendingNippleBatch');
} else {
  console.log('FAILED to find markers', startIdx, endIdx);
}
