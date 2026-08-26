export const UOM_FAMILY_WEIGHT = 'WEIGHT';
export const UOM_FAMILY_COUNT = 'COUNT';
export const UOM_FAMILY_LENGTH = 'LENGTH';

export type UomFamily = 'WEIGHT' | 'COUNT' | 'LENGTH';

export interface ConversionItemData {
  weightPerPiece?: number | string | null;
  piecesPerKg?: number | string | null;
  weightPerMeter?: number | string | null;
  lengthPerPiece?: number | string | null;
}

export interface UomTypeInfo {
  code?: string;
  uomType?: string | null;
}

/** Thrown when a conversion is requested but the required item data does not exist. */
export class MissingConversionDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingConversionDataError';
  }
}

function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Maps a UOM to its production family (KG / PCS / METER).
 * Returns null for UOMs that do not participate in production conversions.
 */
export function familyOf(uom: UomTypeInfo): UomFamily | null {
  switch ((uom.uomType || '').toUpperCase()) {
    case UOM_FAMILY_WEIGHT:
      return UOM_FAMILY_WEIGHT;
    case UOM_FAMILY_COUNT:
      return UOM_FAMILY_COUNT;
    case UOM_FAMILY_LENGTH:
      return UOM_FAMILY_LENGTH;
    default:
      return null;
  }
}

function kgPerPiece(item: ConversionItemData): number | null {
  const wpp = num(item.weightPerPiece);
  if (wpp && wpp > 0) return wpp;
  const ppk = num(item.piecesPerKg);
  if (ppk && ppk > 0) return 1 / ppk;
  return null;
}

function metersPerPiece(item: ConversionItemData): number | null {
  const lpp = num(item.lengthPerPiece);
  if (lpp && lpp > 0) return lpp;
  const wpp = num(item.weightPerPiece);
  const wpm = num(item.weightPerMeter);
  if (wpp && wpp > 0 && wpm && wpm > 0) return wpp / wpm;
  return null;
}

function kgPerMeter(item: ConversionItemData): number | null {
  const wpm = num(item.weightPerMeter);
  if (wpm && wpm > 0) return wpm;
  const wpp = num(item.weightPerPiece);
  const lpp = num(item.lengthPerPiece);
  if (wpp && wpp > 0 && lpp && lpp > 0) return wpp / lpp;
  return null;
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Converts a quantity between two production UOM families using the item's
 * own conversion master data (weight/piece, pieces/kg, weight/meter,
 * length/piece). Derived factors are computed on the fly from consistent
 * data; persisted master data is never modified.
 *
 * Throws MissingConversionDataError when no mathematically valid path exists.
 */
export function convertWithItemData(
  item: ConversionItemData,
  fromFamily: UomFamily,
  toFamily: UomFamily,
  quantity: number,
): number {
  if (!Number.isFinite(quantity)) {
    throw new MissingConversionDataError('Quantity must be a finite number');
  }
  if (quantity < 0) {
    throw new MissingConversionDataError('Quantity must not be negative');
  }

  let result: number;
  switch (`${fromFamily}->${toFamily}`) {
    case 'WEIGHT->COUNT': {
      const kgPerPc = kgPerPiece(item);
      if (!kgPerPc) {
        throw new MissingConversionDataError(
          'KG -> PCS conversion requires Weight Per Piece (or Pieces Per KG) on the item; neither is maintained',
        );
      }
      result = quantity / kgPerPc;
      break;
    }
    case 'COUNT->WEIGHT': {
      const kgPerPc = kgPerPiece(item);
      if (!kgPerPc) {
        throw new MissingConversionDataError(
          'PCS -> KG conversion requires Weight Per Piece (or Pieces Per KG) on the item; neither is maintained',
        );
      }
      result = quantity * kgPerPc;
      break;
    }
    case 'WEIGHT->LENGTH': {
      const kgPerM = kgPerMeter(item);
      if (!kgPerM) {
        throw new MissingConversionDataError(
          'KG -> METER conversion requires Weight Per Meter (or Weight Per Piece combined with Length Per Piece) on the item; none are maintained',
        );
      }
      result = quantity / kgPerM;
      break;
    }
    case 'LENGTH->WEIGHT': {
      const kgPerM = kgPerMeter(item);
      if (!kgPerM) {
        throw new MissingConversionDataError(
          'METER -> KG conversion requires Weight Per Meter (or Weight Per Piece combined with Length Per Piece) on the item; none are maintained',
        );
      }
      result = quantity * kgPerM;
      break;
    }
    case 'COUNT->LENGTH': {
      const mPerPc = metersPerPiece(item);
      if (!mPerPc) {
        throw new MissingConversionDataError(
          'PCS -> METER conversion requires Length Per Piece (or Weight Per Piece combined with Weight Per Meter) on the item; none are maintained',
        );
      }
      result = quantity * mPerPc;
      break;
    }
    case 'LENGTH->COUNT': {
      const mPerPc = metersPerPiece(item);
      if (!mPerPc) {
        throw new MissingConversionDataError(
          'METER -> PCS conversion requires Length Per Piece (or Weight Per Piece combined with Weight Per Meter) on the item; none are maintained',
        );
      }
      result = quantity / mPerPc;
      break;
    }
    default:
      throw new MissingConversionDataError(
        `Unsupported conversion between '${fromFamily}' and '${toFamily}'`,
      );
  }
  return round6(result);
}

/**
 * Returns which cross-family conversions the item can support.
 */
export function supportedConversions(item: ConversionItemData): Array<{
  from: UomFamily;
  to: UomFamily;
  available: boolean;
}> {
  const pairs: Array<[UomFamily, UomFamily]> = [
    [UOM_FAMILY_WEIGHT, UOM_FAMILY_COUNT],
    [UOM_FAMILY_COUNT, UOM_FAMILY_WEIGHT],
    [UOM_FAMILY_WEIGHT, UOM_FAMILY_LENGTH],
    [UOM_FAMILY_LENGTH, UOM_FAMILY_WEIGHT],
    [UOM_FAMILY_COUNT, UOM_FAMILY_LENGTH],
    [UOM_FAMILY_LENGTH, UOM_FAMILY_COUNT],
  ];
  return pairs.map(([from, to]) => ({
    from,
    to,
    available: (() => {
      try {
        convertWithItemData(item, from, to, 1);
        return true;
      } catch {
        return false;
      }
    })(),
  }));
}
