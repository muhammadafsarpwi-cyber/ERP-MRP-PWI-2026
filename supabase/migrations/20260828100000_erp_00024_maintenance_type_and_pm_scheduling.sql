-- Phase B: Add maintenance_type to maintenance_job_cards
-- Also add start_date column to maintenance_pm_plans for proper scheduling

-- Add maintenance_type column
ALTER TABLE maintenance_job_cards
ADD COLUMN IF NOT EXISTS maintenance_type varchar(30) NOT NULL DEFAULT 'BREAKDOWN';

-- Add index for maintenance_type filtering
CREATE INDEX IF NOT EXISTS idx_mjc_maintenance_type ON maintenance_job_cards(maintenance_type);

-- Add start_date to PM plans for schedule generation
ALTER TABLE maintenance_pm_plans
ADD COLUMN IF NOT EXISTS start_date date;

-- Add next_due_date to PM plans for quick overdue detection
ALTER TABLE maintenance_pm_plans
ADD COLUMN IF NOT EXISTS next_due_date date;

-- Add last_generated_at to track when schedules were last generated
ALTER TABLE maintenance_pm_plans
ADD COLUMN IF NOT EXISTS last_generated_at timestamp with time zone;

-- Ensure existing rows have proper maintenance_type
UPDATE maintenance_job_cards SET maintenance_type = 'BREAKDOWN' WHERE maintenance_type IS NULL;
