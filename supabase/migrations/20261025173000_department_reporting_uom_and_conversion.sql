-- Migration: Add reporting_uom, secondary_uom, enable_conversion_bridge to departments
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS reporting_uom varchar(20) DEFAULT 'PCS',
  ADD COLUMN IF NOT EXISTS secondary_uom varchar(20) DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS enable_conversion_bridge boolean DEFAULT false;

-- Configure Spoke Division Departments
UPDATE departments
SET reporting_uom = 'GRS', secondary_uom = 'PCS', enable_conversion_bridge = true
WHERE name IN ('Straightener', 'Swagging', 'Swaging', 'Spoke', 'Spoke Packing', 'Nipple Packing');

UPDATE departments
SET reporting_uom = 'KG', secondary_uom = 'NONE', enable_conversion_bridge = true
WHERE name IN ('Spoke Plating', 'Nipple Plating', 'Plating');

-- Configure CCD / Wire / Cable Departments
UPDATE departments
SET reporting_uom = 'KG', secondary_uom = 'METER', enable_conversion_bridge = true
WHERE name ILIKE '%Flattening%' OR name ILIKE '%Wire Rod%' OR name ILIKE '%Wire Drawing%';

UPDATE departments
SET reporting_uom = 'METER', secondary_uom = 'KG', enable_conversion_bridge = true
WHERE name ILIKE '%Spiral%' OR name ILIKE '%PVC%';
