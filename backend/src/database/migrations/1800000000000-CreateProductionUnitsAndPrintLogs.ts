import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductionUnitsAndPrintLogs1800000000000 implements MigrationInterface {
  name = 'CreateProductionUnitsAndPrintLogs1800000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create production_units table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "production_units" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "is_active" boolean NOT NULL DEFAULT true,
        "company_id" uuid NOT NULL,
        "production_entry_id" uuid,
        "item_id" uuid NOT NULL,
        "uom_id" uuid,
        "unit_serial_no" varchar(50) NOT NULL,
        "coil_no" varchar(30) NOT NULL,
        "qr_payload" varchar(100) NOT NULL,
        "barcode_payload" varchar(100) NOT NULL,
        "code_type" varchar(20) NOT NULL DEFAULT 'QR_BARCODE',
        "production_date" date NOT NULL,
        "batch_no" varchar(50),
        "pvc_batch_no" varchar(50),
        "shift_id" uuid,
        "shift_name" varchar(100),
        "operator_name" varchar(255),
        "machine_id" uuid,
        "machine_no" varchar(50),
        "department_name" varchar(255),
        "length_meters" decimal(12, 4),
        "weight_kg" decimal(12, 4),
        "joint_count" int,
        "st_value" varchar(20),
        "quality_status" varchar(30),
        "remarks" text,
        "status" varchar(20) NOT NULL DEFAULT 'GENERATED',
        "voided_by" uuid,
        "voided_at" TIMESTAMP WITH TIME ZONE,
        "void_reason" text,
        "first_printed_at" TIMESTAMP WITH TIME ZONE,
        "first_printed_by" uuid,
        "print_count" int NOT NULL DEFAULT 0,
        "label_template" varchar(50) DEFAULT 'PVC_COIL'
      );
    `);

    // Constraints & foreign keys for production_units
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pu_company') THEN
          ALTER TABLE "production_units" ADD CONSTRAINT "fk_pu_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pu_item') THEN
          ALTER TABLE "production_units" ADD CONSTRAINT "fk_pu_item" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT;
        END IF;
      END $$;
    `);

    // Unique & search indexes
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_pu_company_serial" ON "production_units" ("company_id", "unit_serial_no");
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_pu_qr_payload" ON "production_units" ("qr_payload");
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_pu_barcode_payload" ON "production_units" ("barcode_payload");
      CREATE INDEX IF NOT EXISTS "idx_pu_entry" ON "production_units" ("company_id", "production_entry_id");
      CREATE INDEX IF NOT EXISTS "idx_pu_status" ON "production_units" ("company_id", "status");
      CREATE INDEX IF NOT EXISTS "idx_pu_item" ON "production_units" ("item_id");
    `);

    // 2. Create production_unit_print_logs table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "production_unit_print_logs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "is_active" boolean NOT NULL DEFAULT true,
        "production_unit_id" uuid NOT NULL,
        "print_job_id" varchar(50),
        "event_type" varchar(20) NOT NULL DEFAULT 'PRINT',
        "printed_by" uuid,
        "printed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "printer_name" varchar(255),
        "copies" int NOT NULL DEFAULT 1,
        "label_template" varchar(50),
        CONSTRAINT "fk_pu_print_log_unit" FOREIGN KEY ("production_unit_id") REFERENCES "production_units"("id") ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "idx_pu_print_log_unit" ON "production_unit_print_logs" ("production_unit_id");
      CREATE INDEX IF NOT EXISTS "idx_pu_print_log_job" ON "production_unit_print_logs" ("print_job_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "production_unit_print_logs";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "production_units";`);
  }
}
