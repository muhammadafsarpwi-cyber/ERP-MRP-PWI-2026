-- Migration: Update BOM-SPK-003 component line ratios
-- Business Rule:
-- 1 Finished Good Carton = 10 Gross = 1,440 PCS
--   - Inner Spoke = 5 Gross (720 PCS) -> ratio = 0.5000 per Base Unit
--   - Outer Spoke = 5 Gross (720 PCS) -> ratio = 0.5000 per Base Unit
--   - Nipple      = 10 Gross (1,440 PCS) -> ratio = 1.0000 per Base Unit
-- 50 Finished Good Cartons = 500 Gross = 72,000 PCS
--   - Inner Spoke = 250 Gross (36,000 PCS)
--   - Outer Spoke = 250 Gross (36,000 PCS)
--   - Nipple      = 500 Gross (72,000 PCS)

DO $$
DECLARE
  v_bom_id UUID;
BEGIN
  SELECT id INTO v_bom_id FROM bill_of_materials WHERE bom_code = 'BOM-SPK-003' LIMIT 1;
  IF v_bom_id IS NOT NULL THEN
    -- Update Inner Spoke line to 0.5000
    UPDATE bom_lines
    SET quantity = 0.5000
    WHERE bom_id = v_bom_id
      AND (remarks ILIKE '%inner%' OR item_id IN (SELECT id FROM items WHERE item_code ILIKE '%inner%' OR name ILIKE '%inner%'));

    -- Update Outer Spoke line to 0.5000
    UPDATE bom_lines
    SET quantity = 0.5000
    WHERE bom_id = v_bom_id
      AND (remarks ILIKE '%outer%' OR item_id IN (SELECT id FROM items WHERE item_code ILIKE '%outer%' OR name ILIKE '%outer%'));

    -- Update Nipple line to 1.0000
    UPDATE bom_lines
    SET quantity = 1.0000
    WHERE bom_id = v_bom_id
      AND (remarks ILIKE '%nipple%' OR item_id IN (SELECT id FROM items WHERE item_code ILIKE '%nip%' OR name ILIKE '%nipple%'));
  END IF;
END $$;
