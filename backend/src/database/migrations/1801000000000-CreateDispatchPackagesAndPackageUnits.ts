import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDispatchPackagesAndPackageUnits1801000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dispatch_packages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          package_no VARCHAR(50) NOT NULL,
          customer_id UUID,
          customer_name VARCHAR(255),
          sales_order_id UUID,
          sales_order_no VARCHAR(100),
          sales_delivery_id UUID,
          gate_pass_no VARCHAR(100),
          warehouse_id UUID,
          warehouse_name VARCHAR(100),
          package_date DATE NOT NULL DEFAULT CURRENT_DATE,
          status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
          total_units INTEGER NOT NULL DEFAULT 0,
          total_weight_kg NUMERIC(15, 4) NOT NULL DEFAULT 0,
          total_length_meters NUMERIC(15, 4) NOT NULL DEFAULT 0,
          package_qr_payload VARCHAR(100) NOT NULL,
          vehicle_no VARCHAR(50),
          driver_name VARCHAR(100),
          driver_phone VARCHAR(50),
          dispatch_location VARCHAR(255),
          remarks TEXT,
          finalized_at TIMESTAMPTZ,
          finalized_by UUID,
          finalized_by_name VARCHAR(100),
          dispatched_at TIMESTAMPTZ,
          dispatched_by UUID,
          dispatched_by_name VARCHAR(100),
          gate_exited_at TIMESTAMPTZ,
          gate_exited_by UUID,
          gate_exited_by_name VARCHAR(100),
          cancelled_at TIMESTAMPTZ,
          cancelled_by UUID,
          cancellation_reason TEXT,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_by UUID,
          updated_by UUID,
          CONSTRAINT uq_dispatch_packages_company_pkgno UNIQUE (company_id, package_no),
          CONSTRAINT uq_dispatch_packages_company_qr UNIQUE (company_id, package_qr_payload)
      );

      CREATE TABLE IF NOT EXISTS dispatch_package_units (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          package_id UUID NOT NULL REFERENCES dispatch_packages(id) ON DELETE CASCADE,
          production_unit_id UUID NOT NULL REFERENCES production_units(id),
          unit_serial_no VARCHAR(50) NOT NULL,
          coil_no VARCHAR(30) NOT NULL,
          item_id UUID NOT NULL,
          item_name VARCHAR(255),
          item_code VARCHAR(100),
          weight_kg NUMERIC(15, 4),
          length_meters NUMERIC(15, 4),
          batch_no VARCHAR(50),
          status VARCHAR(20) NOT NULL DEFAULT 'PACKED',
          added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          added_by UUID,
          removed_at TIMESTAMPTZ,
          removed_by UUID,
          removal_reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dispatch_package_audit_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          package_id UUID NOT NULL REFERENCES dispatch_packages(id) ON DELETE CASCADE,
          action VARCHAR(50) NOT NULL,
          production_unit_id UUID,
          unit_serial_no VARCHAR(50),
          details JSONB,
          performed_by UUID,
          performed_by_name VARCHAR(100),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_dispatch_packages_company ON dispatch_packages(company_id);
      CREATE INDEX IF NOT EXISTS idx_dispatch_packages_status ON dispatch_packages(company_id, status);
      CREATE INDEX IF NOT EXISTS idx_dispatch_packages_so ON dispatch_packages(sales_order_id);
      CREATE INDEX IF NOT EXISTS idx_dispatch_packages_sd ON dispatch_packages(sales_delivery_id);

      CREATE INDEX IF NOT EXISTS idx_dpu_package_id ON dispatch_package_units(package_id);
      CREATE INDEX IF NOT EXISTS idx_dpu_prod_unit ON dispatch_package_units(production_unit_id);
      CREATE INDEX IF NOT EXISTS idx_dpu_serial ON dispatch_package_units(unit_serial_no);

      -- Unique concurrency protection: A unit cannot be simultaneously PACKED in multiple packages
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_packed_unit 
      ON dispatch_package_units (production_unit_id) 
      WHERE status = 'PACKED';

      CREATE INDEX IF NOT EXISTS idx_dpa_package_id ON dispatch_package_audit_logs(package_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS dispatch_package_audit_logs;
      DROP TABLE IF EXISTS dispatch_package_units;
      DROP TABLE IF EXISTS dispatch_packages;
    `);
  }
}
