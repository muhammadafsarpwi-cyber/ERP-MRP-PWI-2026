-- Migration: Reallocate misrouted production packing entries to authentic Packing Department
-- Description: Scans all historical production packing rows where incorrect auto-routing took place,
-- updates their department IDs, and re-allocates them to authentic Packing Department (SPD-DEPT008).

DO $$
DECLARE
  v_spoke_packing_dept_id UUID := 'd3000000-0000-0000-0000-000000000008';
  v_spoke_packing_sec_id  UUID := 'd2000000-0000-0000-0000-000000000004';
  v_spoke_div_id          UUID := 'd1000000-0000-0000-0000-000000000001';
BEGIN
  UPDATE production_entries pe
  SET department_id = v_spoke_packing_dept_id,
      section_id = v_spoke_packing_sec_id,
      division_id = v_spoke_div_id,
      updated_at = now()
  FROM items i
  WHERE pe.item_id = i.id
    AND pe.is_active = true
    AND pe.department_id != v_spoke_packing_dept_id
    AND (
      (i.item_code ILIKE '%spk%' OR i.item_code ILIKE '%fg-spk%' OR i.name ILIKE '%spoke%')
      AND (
        pe.remarks ILIKE '%[hand packing]%'
        OR pe.machine_no ILIKE 'hand-pack%'
        OR pe.remarks ILIKE '%Spoke Boxing%'
        OR pe.remarks ILIKE '%Hand Packing Line%'
      )
    );
END $$;
