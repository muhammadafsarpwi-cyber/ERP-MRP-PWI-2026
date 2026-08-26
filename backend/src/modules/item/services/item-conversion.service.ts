import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Item } from '../entities/item.entity';
import { Uom } from '../entities/uom.entity';
import { UomConversion, UomConversionStatus } from '../entities/uom-conversion.entity';
import {
  convertWithItemData,
  familyOf,
  supportedConversions,
  UomFamily,
  MissingConversionDataError,
} from './uom-conversion.calculator';

export interface ConvertRequest {
  quantity: number;
  fromUomId?: string;
  fromUomCode?: string;
  toUomId?: string;
  toUomCode?: string;
}

export interface ConvertResult {
  itemId: string;
  itemCode: string;
  quantity: number;
  fromUom: { id: string; code: string; uomType: string };
  toUom: { id: string; code: string; uomType: string };
  value: number;
}

@Injectable()
export class ItemConversionService {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    @InjectRepository(Uom)
    private readonly uomRepository: Repository<Uom>,
    @InjectRepository(UomConversion)
    private readonly conversionRepository: Repository<UomConversion>,
  ) {}

  /**
   * Returns the item's UOM conversion information: master data values and
   * which production conversions are available.
   */
  async getConversionInfo(itemId: string) {
    const item = await this.itemRepository.findOne({
      where: { id: itemId },
      relations: ['baseUom'],
    });
    if (!item) throw new NotFoundException(`Item with ID '${itemId}' not found`);

    const weights = {
      weightPerPiece: item.weightPerPiece ?? null,
      piecesPerKg: item.piecesPerKg ?? null,
      weightPerMeter: item.weightPerMeter ?? null,
      lengthPerPiece: item.lengthPerPiece ?? null,
    };

    return {
      itemId: item.id,
      itemCode: item.itemCode,
      baseUom: item.baseUom
        ? { id: item.baseUom.id, code: item.baseUom.code, uomType: item.baseUom.uomType }
        : null,
      weights,
      supportedConversions: supportedConversions(weights),
    };
  }

  /**
   * Converts a quantity between two UOMs for a specific item.
   * - Same UOM: identity.
   * - Same family, different unit: uses the global uom_conversions table.
   * - Cross family (KG/PCS/METER): uses the item's own weight conversion data.
   * Never silently produces an incorrect value; throws a clear validation
   * message when required data is missing.
   */
  async convert(itemId: string, req: ConvertRequest): Promise<ConvertResult> {
    const item = await this.itemRepository.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException(`Item with ID '${itemId}' not found`);

    if (req.quantity === null || req.quantity === undefined || !Number.isFinite(Number(req.quantity))) {
      throw new BadRequestException('quantity is required and must be a number');
    }
    const quantity = Number(req.quantity);
    if (quantity < 0) throw new BadRequestException('quantity must not be negative');

    const from = await this.resolveUom(req.fromUomId, req.fromUomCode, 'fromUom');
    const to = await this.resolveUom(req.toUomId, req.toUomCode, 'toUom');

    if (from.id === to.id) {
      return this.buildResult(item, from, to, quantity);
    }

    const fromFamily = familyOf(from);
    const toFamily = familyOf(to);

    if (!fromFamily) {
      throw new BadRequestException(`UOM '${from.code}' does not belong to a production family (KG/PCS/METER)`);
    }
    if (!toFamily) {
      throw new BadRequestException(`UOM '${to.code}' does not belong to a production family (KG/PCS/METER)`);
    }

    if (fromFamily === toFamily) {
      const value = await this.convertWithinFamily(from, to, quantity);
      return this.buildResult(item, from, to, value);
    }

    try {
      const value = convertWithItemData(item, fromFamily as UomFamily, toFamily as UomFamily, quantity);
      return this.buildResult(item, from, to, value);
    } catch (e) {
      if (e instanceof MissingConversionDataError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }
  }

  private buildResult(item: Item, from: Uom, to: Uom, value: number): ConvertResult {
    return {
      itemId: item.id,
      itemCode: item.itemCode,
      quantity: value,
      fromUom: { id: from.id, code: from.code, uomType: from.uomType },
      toUom: { id: to.id, code: to.code, uomType: to.uomType },
      // `value` is the canonical converted amount; `quantity` echoes it for convenience.
      value,
    };
  }

  private async resolveUom(uomId?: string, uomCode?: string, field = 'uom'): Promise<Uom> {
    if (!uomId && !uomCode) {
      throw new BadRequestException(`${field}: provide either uomId or uomCode`);
    }
    let uom: Uom | null = null;
    if (uomId) {
      uom = await this.uomRepository.findOne({ where: { id: uomId } });
      if (!uom) throw new BadRequestException(`${field}: UOM with ID '${uomId}' not found`);
    } else if (uomCode) {
      uom = await this.uomRepository.findOne({ where: { code: uomCode.toUpperCase() } });
      if (!uom) throw new BadRequestException(`${field}: UOM with code '${uomCode}' not found`);
    }
    return uom as Uom;
  }

  private async convertWithinFamily(from: Uom, to: Uom, quantity: number): Promise<number> {
    const conversions = await this.conversionRepository.find({
      where: [
        { fromUomId: In([from.id, to.id]), status: UomConversionStatus.ACTIVE },
      ],
      relations: ['fromUom', 'toUom'],
    });

    const direct = conversions.find((c) => c.fromUomId === from.id && c.toUomId === to.id);
    if (direct && direct.conversionFactor > 0) {
      return Math.round(quantity * Number(direct.conversionFactor) * 1e6) / 1e6;
    }
    const inverse = conversions.find((c) => c.fromUomId === to.id && c.toUomId === from.id);
    if (inverse && inverse.conversionFactor > 0) {
      return Math.round((quantity / Number(inverse.conversionFactor)) * 1e6) / 1e6;
    }
    throw new BadRequestException(
      `No conversion is defined between '${from.code}' and '${to.code}'. Maintain a UOM conversion or use the item's base UOM.`,
    );
  }
}
