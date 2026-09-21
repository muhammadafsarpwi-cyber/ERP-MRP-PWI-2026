import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { StockLedgerService } from './stock-ledger.service';
import { InventoryBalanceService } from './inventory-balance.service';
import { BatchService } from './batch.service';
import { PostOpeningStockDto, OpeningStockLineDto } from '../dto';

@Injectable()
export class OpeningStockService {
  private readonly logger = new Logger(OpeningStockService.name);

  constructor(
    private readonly ledgerService: StockLedgerService,
    private readonly balanceService: InventoryBalanceService,
    private readonly batchService: BatchService,
  ) {}

  async postOpeningStock(
    dto: PostOpeningStockDto,
    userId?: string,
  ): Promise<{ posted: number; lines: any[] }> {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('Opening stock must have at least one line');
    }

    const companyId = dto.companyId || '7725aa04-a270-4314-9e82-90949cbe7791';
    const results: any[] = [];

    for (const line of dto.lines) {
      let batchId = line.batchId || undefined;

      if (line.batchNumber && !batchId) {
        const batch = await this.batchService.create({
          companyId,
          itemId: line.itemId,
          warehouseId: dto.warehouseId,
          batchNumber: line.batchNumber,
          quantity: line.quantity,
        }, userId);
        batchId = batch.id;
      }

      const ledgerEntry = await this.ledgerService.create({
        companyId,
        transactionType: 'OPENING',
        transactionDate: dto.transactionDate || new Date(),
        itemId: line.itemId,
        warehouseId: dto.warehouseId,
        locationId: line.locationId,
        quantity: line.quantity,
        uomId: line.uomId,
        direction: 'IN',
        referenceType: 'OPENING_STOCK',
        referenceNumber: dto.referenceNumber,
        batchId,
        serialNumber: line.serialNumber || undefined,
        notes: line.notes || undefined,
        createdBy: userId,
      });

      await this.balanceService.updateBalance(
        companyId,
        line.itemId,
        dto.warehouseId,
        line.locationId || null,
        batchId || null,
        line.uomId,
        line.quantity,
        'IN',
      );

      results.push({
        ledgerId: ledgerEntry.id,
        itemId: line.itemId,
        quantity: line.quantity,
        batchId: batchId || null,
      });

      this.logger.log(
        `Opening stock posted: ${line.quantity} of item ${line.itemId} in warehouse ${dto.warehouseId}`,
      );
    }

    return { posted: results.length, lines: results };
  }
}
