-- Persist the complete Company -> Division -> Section context on every job card.
-- Existing cards are backfilled only from their existing machine relationship.
BEGIN;

ALTER TABLE maintenance_job_cards
  ADD COLUMN IF NOT EXISTS division_id UUID,
  ADD COLUMN IF NOT EXISTS section_id UUID;

UPDATE maintenance_job_cards jc
SET division_id = m.division_id,
    section_id = m.section_id
FROM machines m
WHERE m.id = jc.machine_id
  AND (jc.division_id IS NULL OR jc.section_id IS NULL);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM maintenance_job_cards
    WHERE division_id IS NULL OR section_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot backfill maintenance_job_cards organization context: one or more cards have no machine division/section';
  END IF;
END $$;

ALTER TABLE maintenance_job_cards
  ALTER COLUMN division_id SET NOT NULL,
  ALTER COLUMN section_id SET NOT NULL;

ALTER TABLE maintenance_job_cards
  DROP CONSTRAINT IF EXISTS fk_mjc_division,
  DROP CONSTRAINT IF EXISTS fk_mjc_section;

ALTER TABLE maintenance_job_cards
  ADD CONSTRAINT fk_mjc_division FOREIGN KEY (division_id) REFERENCES divisions(id),
  ADD CONSTRAINT fk_mjc_section FOREIGN KEY (section_id) REFERENCES sections(id);

CREATE INDEX IF NOT EXISTS idx_mjc_division_id ON maintenance_job_cards(division_id);
CREATE INDEX IF NOT EXISTS idx_mjc_section_id ON maintenance_job_cards(section_id);

COMMIT;
