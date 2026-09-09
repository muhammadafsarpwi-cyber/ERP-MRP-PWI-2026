import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStockTransferApprovalAndHistory1793000000000 implements MigrationInterface {
  name = 'AddStockTransferApprovalAndHistory1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add workflow and approval columns to stock_transfers if they don't already exist
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_transfers' AND column_name = 'submitted_by') THEN
          ALTER TABLE stock_transfers ADD COLUMN submitted_by UUID;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_transfers' AND column_name = 'submitted_at') THEN
          ALTER TABLE stock_transfers ADD COLUMN submitted_at TIMESTAMP WITH TIME ZONE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_transfers' AND column_name = 'approval_remarks') THEN
          ALTER TABLE stock_transfers ADD COLUMN approval_remarks TEXT;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_transfers' AND column_name = 'returned_by') THEN
          ALTER TABLE stock_transfers ADD COLUMN returned_by UUID;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_transfers' AND column_name = 'returned_at') THEN
          ALTER TABLE stock_transfers ADD COLUMN returned_at TIMESTAMP WITH TIME ZONE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_transfers' AND column_name = 'return_reason') THEN
          ALTER TABLE stock_transfers ADD COLUMN return_reason TEXT;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_transfers' AND column_name = 'return_remarks') THEN
          ALTER TABLE stock_transfers ADD COLUMN return_remarks TEXT;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_transfers' AND column_name = 'rejected_by') THEN
          ALTER TABLE stock_transfers ADD COLUMN rejected_by UUID;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_transfers' AND column_name = 'rejected_at') THEN
          ALTER TABLE stock_transfers ADD COLUMN rejected_at TIMESTAMP WITH TIME ZONE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_transfers' AND column_name = 'rejection_reason') THEN
          ALTER TABLE stock_transfers ADD COLUMN rejection_reason TEXT;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_transfers' AND column_name = 'rejection_remarks') THEN
          ALTER TABLE stock_transfers ADD COLUMN rejection_remarks TEXT;
        END IF;
      END $$;
    `);

    // Foreign key constraints to erp_users if not exists
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_transfers_submitted_by') THEN
          ALTER TABLE stock_transfers
            ADD CONSTRAINT fk_stock_transfers_submitted_by
            FOREIGN KEY (submitted_by) REFERENCES erp_users(id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_transfers_approved_by') THEN
          ALTER TABLE stock_transfers
            ADD CONSTRAINT fk_stock_transfers_approved_by
            FOREIGN KEY (approved_by) REFERENCES erp_users(id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_transfers_returned_by') THEN
          ALTER TABLE stock_transfers
            ADD CONSTRAINT fk_stock_transfers_returned_by
            FOREIGN KEY (returned_by) REFERENCES erp_users(id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_transfers_rejected_by') THEN
          ALTER TABLE stock_transfers
            ADD CONSTRAINT fk_stock_transfers_rejected_by
            FOREIGN KEY (rejected_by) REFERENCES erp_users(id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_transfers_posted_by') THEN
          ALTER TABLE stock_transfers
            ADD CONSTRAINT fk_stock_transfers_posted_by
            FOREIGN KEY (posted_by) REFERENCES erp_users(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // 2. Update status check constraint on stock_transfers
    await queryRunner.query(`
      ALTER TABLE stock_transfers DROP CONSTRAINT IF EXISTS stock_transfers_status_check;
      ALTER TABLE stock_transfers ADD CONSTRAINT stock_transfers_status_check
        CHECK (status IN ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'RETURNED', 'REJECTED', 'POSTED', 'CANCELLED', 'COMPLETED', 'IN_TRANSIT'));
    `);

    // 3. Create stock_transfer_history table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stock_transfer_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
        action VARCHAR(50) NOT NULL,
        from_status VARCHAR(30),
        to_status VARCHAR(30) NOT NULL,
        performed_by UUID REFERENCES erp_users(id) ON DELETE SET NULL,
        performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        reason TEXT,
        remarks TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_stock_transfer_history_transfer_id
        ON stock_transfer_history(transfer_id);

      CREATE INDEX IF NOT EXISTS idx_stock_transfer_history_performed_at
        ON stock_transfer_history(performed_at);
    `);

    // 3. Ensure inventory.transfer.submit permission exists
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM permissions WHERE permission_code = 'inventory.transfer.submit') THEN
          INSERT INTO permissions (id, permission_code, name, module, resource, action, description)
          VALUES (
            gen_random_uuid(),
            'inventory.transfer.submit',
            'Submit Stock Transfer',
            'inventory',
            'transfer',
            'SUBMIT',
            'Submit draft stock transfer for review and approval'
          );
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS stock_transfer_history;`);
  }
}
