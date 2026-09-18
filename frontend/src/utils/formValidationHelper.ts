import { message } from 'antd';

/**
 * Converts camelCase or snake_case or dotted field path to Title Case with spaces.
 * e.g. "itemCode" -> "Item Code", "baseUomId" -> "Base UOM", "sellingPrice" -> "Selling Price"
 */
export function formatFieldLabel(fieldName: string): string {
  const overrides: Record<string, string> = {
    itemcode: 'Item Code',
    itemname: 'Item Name',
    name: 'Name',
    itemtype: 'Item Type',
    itemtypeid: 'Item Type',
    baseuomid: 'Base UOM',
    purchaseuomid: 'Purchase UOM',
    salesuomid: 'Sales UOM',
    categoryid: 'Category',
    divisionid: 'Division',
    sectionid: 'Section',
    departmentid: 'Department',
    machinecode: 'Machine Code',
    routetypeid: 'Route Type',
    routetype: 'Route Type',
    phone: 'Phone Number',
    costprice: 'Cost Price',
    sellingprice: 'Selling Price',
    reorderlevel: 'Reorder Level',
    safetystocklevel: 'Safety Stock Level',
    minimumstocklevel: 'Minimum Stock Level',
    maximumstocklevel: 'Maximum Stock Level',
  };

  const lower = fieldName.toLowerCase().replace(/[_\s-]/g, '');
  if (overrides[lower]) return overrides[lower];

  return fieldName
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

export interface ValidationSummary {
  missingFields: string[];
  bulletList: string;
  firstFieldName: string;
}

/**
 * Inspects an Ant Design validation error object.
 * If validation failed, scrolls the form to the first invalid field,
 * formats human-readable error descriptions, and shows a message.
 */
export function handleValidationErrors(err: any, form?: any): ValidationSummary | null {
  if (!err?.errorFields || !Array.isArray(err.errorFields) || err.errorFields.length === 0) {
    return null;
  }

  // Scroll to first invalid field
  const firstField = err.errorFields[0];
  if (form && typeof form.scrollToField === 'function' && firstField?.name) {
    try {
      form.scrollToField(firstField.name, { behavior: 'smooth', block: 'center' });
    } catch {
      // scroll may fail in unmounted virtual lists
    }
  }

  const missingFields: string[] = [];
  err.errorFields.forEach((field: any) => {
    const rawPath = Array.isArray(field.name) ? field.name.join(' > ') : String(field.name || '');
    const label = formatFieldLabel(rawPath);
    const msg = (field.errors && field.errors.length > 0) ? field.errors[0] : 'This field is required';
    missingFields.push(`${label}: ${msg}`);
  });

  const bulletList = missingFields.map((f) => `• ${f}`).join('\n');
  const firstFieldName = err.errorFields[0]?.name
    ? (Array.isArray(err.errorFields[0].name) ? err.errorFields[0].name.join(' ') : String(err.errorFields[0].name))
    : '';

  message.error(`Please fill all required fields (${err.errorFields.length} missing)`, 5);

  return {
    missingFields,
    bulletList,
    firstFieldName,
  };
}
