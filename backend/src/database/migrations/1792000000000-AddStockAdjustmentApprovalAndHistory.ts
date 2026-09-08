import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStockAdjustmentApprovalAndHistory1792000000000 implements MigrationInterface {
  name = 'AddStockAdjustmentApprovalAndHistory1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add workflow and approval columns to stock_adjustments if they don't already exist
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_adjustments' AND column_name = 'submitted_by') THEN
          ALTER TABLE stock_adjustments ADD COLUMN submitted_by UUID;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_adjustments' AND column_name = 'submitted_at') THEN
          ALTER TABLE stock_adjustments ADD COLUMN submitted_at TIMESTAMP WITH TIME ZONE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_adjustments' AND column_name = 'approval_remarks') THEN
          ALTER TABLE stock_adjustments ADD COLUMN approval_remarks TEXT;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_adjustments' AND column_name = 'returned_by') THEN
          ALTER TABLE stock_adjustments ADD COLUMN returned_by UUID;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_adjustments' AND column_name = 'returned_at') THEN
          ALTER TABLE stock_adjustments ADD COLUMN returned_at TIMESTAMP WITH TIME ZONE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_adjustments' AND column_name = 'return_reason') THEN
          ALTER TABLE stock_adjustments ADD COLUMN return_reason TEXT;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_adjustments' AND column_name = 'return_remarks') THEN
          ALTER TABLE stock_adjustments ADD COLUMN return_remarks TEXT;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_adjustments' AND column_name = 'rejected_by') THEN
          ALTER TABLE stock_adjustments ADD COLUMN rejected_by UUID;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_adjustments' AND column_name = 'rejected_at') THEN
          ALTER TABLE stock_adjustments ADD COLUMN rejected_at TIMESTAMP WITH TIME ZONE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_adjustments' AND column_name = 'rejection_reason') THEN
          ALTER TABLE stock_adjustments ADD COLUMN rejection_reason TEXT;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_adjustments' AND column_name = 'rejection_remarks') THEN
          ALTER TABLE stock_adjustments ADD COLUMN rejection_remarks TEXT;
        END IF;
      END $$;
    `);

    // Add foreign key constraints to erp_users if not exists
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_adjustments_submitted_by') THEN
          ALTER TABLE stock_adjustments
            ADD CONSTRAINT fk_stock_adjustments_submitted_by
            FOREIGN KEY (submitted_by) REFERENCES erp_users(id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_adjustments_approved_by') THEN
          ALTER TABLE stock_adjustments
            ADD CONSTRAINT fk_stock_adjustments_approved_by
            FOREIGN KEY (approved_by) REFERENCES erp_users(id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_adjustments_returned_by') THEN
          ALTER TABLE stock_adjustments
            ADD CONSTRAINT fk_stock_adjustments_returned_by
            FOREIGN KEY (returned_by) REFERENCES erp_users(id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_adjustments_rejected_by') THEN
          ALTER TABLE stock_adjustments
            ADD CONSTRAINT fk_stock_adjustments_rejected_by
            FOREIGN KEY (rejected_by) REFERENCES erp_users(id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_adjustments_posted_by') THEN
          ALTER TABLE stock_adjustments
            ADD CONSTRAINT fk_stock_adjustments_posted_by
            FOREIGN KEY (posted_by) REFERENCES erp_users(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // 2. Create stock_adjustment_history table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stock_adjustment_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        adjustment_id UUID NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
        action VARCHAR(50) NOT NULL,
        from_status VARCHAR(30),
        to_status VARCHAR(30) NOT NULL,
        performed_by UUID REFERENCES erp_users(id) ON DELETE SET NULL,
        performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        reason TEXT,
        remarks TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_stock_adjustment_history_adj_id ON stock_adjustment_history(adjustment_id);
      CREATE INDEX IF NOT EXISTS idx_stock_adjustment_history_performed_at ON stock_adjustment_history(performed_at);
    `);

    // 3. Backfill baseline history for existing stock_adjustments if table is empty
    await queryRunner.query(`
      INSERT INTO stock_adjustment_history (adjustment_id, action, from_status, to_status, performed_by, performed_at, remarks)
      SELECT 
        sa.id,
        CASE 
          WHEN sa.status = 'POSTED' THEN 'POSTED'
          WHEN sa.status = 'APPROVED' THEN 'APPROVED'
          WHEN sa.status = 'SUBMITTED' THEN 'SUBMITTED'
          ELSE 'CREATED'
        END,
        NULL,
        sa.status,
        COALESCE(sa.posted_by, sa.approved_by, sa.created_by),
        COALESCE(sa.posted_at, sa.approved_at, sa.created_at, NOW()),
        'Initial record migration'
      FROM stock_adjustments sa
      WHERE NOT EXISTS (
        SELECT 1 FROM stock_adjustment_history sah WHERE sah.adjustment_id = sa.id
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS stock_adjustment_history`);
    await queryRunner.query(`
      ALTER TABLE stock_adjustments
        DROP COLUMN IF EXISTS submitted_by,
        DROP COLUMN IF EXISTS submitted_at,
        DROP COLUMN IF EXISTS approval_remarks,
        DROP COLUMN IF EXISTS returned_by,
        DROP COLUMN IF EXISTS returned_at,
        DROP COLUMN IF EXISTS return_reason,
        DROP COLUMN IF EXISTS return_remarks,
        DROP COLUMN IF EXISTS rejected_by,
        DROP COLUMN IF EXISTS rejected_at,
        DROP COLUMN IF EXISTS rejection_reason,
        DROP COLUMN IF EXISTS rejection_remarks;
    `);
  }
}
