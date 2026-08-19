import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrganizationTables1692400000000 implements MigrationInterface {
  name = 'CreateOrganizationTables1692400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Companies table
    await queryRunner.query(`
      CREATE TABLE "companies" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" UUID,
        "updated_by" UUID,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "legal_name" VARCHAR(255) NOT NULL,
        "trade_name" VARCHAR(255),
        "company_code" VARCHAR(50) NOT NULL,
        "registration_number" VARCHAR(100),
        "tax_registration_number" VARCHAR(100),
        "email" VARCHAR(100),
        "phone" VARCHAR(20),
        "website" VARCHAR(255),
        "address_line1" VARCHAR(255),
        "address_line2" VARCHAR(255),
        "city" VARCHAR(100),
        "state_province" VARCHAR(100),
        "postal_code" VARCHAR(20),
        "country" VARCHAR(100),
        "base_currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
        "fiscal_year_start" VARCHAR(5) NOT NULL DEFAULT '01-01',
        "timezone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
        "date_format" VARCHAR(20) NOT NULL DEFAULT 'YYYY-MM-DD',
        "number_format" VARCHAR(20) NOT NULL DEFAULT '#,##0.00',
        "logo_url" VARCHAR(500),
        "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        CONSTRAINT "PK_companies_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_companies_company_code" UNIQUE ("company_code")
      )
    `);

    // Indexes for companies
    await queryRunner.query(`CREATE INDEX "IDX_companies_company_code" ON "companies" ("company_code")`);
    await queryRunner.query(`CREATE INDEX "IDX_companies_status" ON "companies" ("status")`);

    // Branches table
    await queryRunner.query(`
      CREATE TABLE "branches" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" UUID,
        "updated_by" UUID,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "company_id" UUID NOT NULL,
        "branch_code" VARCHAR(50) NOT NULL,
        "name" VARCHAR(255) NOT NULL,
        "registration_number" VARCHAR(100),
        "tax_registration_number" VARCHAR(100),
        "email" VARCHAR(100),
        "phone" VARCHAR(20),
        "address" VARCHAR(255),
        "city" VARCHAR(100),
        "state_province" VARCHAR(100),
        "postal_code" VARCHAR(20),
        "country" VARCHAR(100),
        "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        CONSTRAINT "PK_branches_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_branches_branch_code_company" UNIQUE ("branch_code", "company_id")
      )
    `);

    // Indexes for branches
    await queryRunner.query(`CREATE INDEX "IDX_branches_company_id" ON "branches" ("company_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_branches_branch_code" ON "branches" ("branch_code")`);
    await queryRunner.query(`CREATE INDEX "IDX_branches_status" ON "branches" ("status")`);

    // Foreign key for branches to companies
    await queryRunner.query(`
      ALTER TABLE "branches" ADD CONSTRAINT "FK_branches_company"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // Business Units table
    await queryRunner.query(`
      CREATE TABLE "business_units" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" UUID,
        "updated_by" UUID,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "company_id" UUID NOT NULL,
        "branch_id" UUID,
        "code" VARCHAR(50) NOT NULL,
        "name" VARCHAR(255) NOT NULL,
        "description" TEXT,
        "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        CONSTRAINT "PK_business_units_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_business_units_code_company" UNIQUE ("code", "company_id")
      )
    `);

    // Indexes for business units
    await queryRunner.query(`CREATE INDEX "IDX_business_units_company_id" ON "business_units" ("company_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_business_units_branch_id" ON "business_units" ("branch_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_business_units_code" ON "business_units" ("code")`);
    await queryRunner.query(`CREATE INDEX "IDX_business_units_status" ON "business_units" ("status")`);

    // Foreign keys for business units
    await queryRunner.query(`
      ALTER TABLE "business_units" ADD CONSTRAINT "FK_business_units_company"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "business_units" ADD CONSTRAINT "FK_business_units_branch"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // Departments table
    await queryRunner.query(`
      CREATE TABLE "departments" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" UUID,
        "updated_by" UUID,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "company_id" UUID NOT NULL,
        "branch_id" UUID,
        "business_unit_id" UUID,
        "department_code" VARCHAR(50) NOT NULL,
        "name" VARCHAR(255) NOT NULL,
        "description" TEXT,
        "parent_department_id" UUID,
        "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        CONSTRAINT "PK_departments_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_departments_code_company" UNIQUE ("department_code", "company_id")
      )
    `);

    // Indexes for departments
    await queryRunner.query(`CREATE INDEX "IDX_departments_company_id" ON "departments" ("company_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_departments_branch_id" ON "departments" ("branch_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_departments_business_unit_id" ON "departments" ("business_unit_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_departments_parent_department_id" ON "departments" ("parent_department_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_departments_department_code" ON "departments" ("department_code")`);
    await queryRunner.query(`CREATE INDEX "IDX_departments_status" ON "departments" ("status")`);

    // Foreign keys for departments
    await queryRunner.query(`
      ALTER TABLE "departments" ADD CONSTRAINT "FK_departments_company"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "departments" ADD CONSTRAINT "FK_departments_branch"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "departments" ADD CONSTRAINT "FK_departments_business_unit"
      FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "departments" ADD CONSTRAINT "FK_departments_parent_department"
      FOREIGN KEY ("parent_department_id") REFERENCES "departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // Warehouses table
    await queryRunner.query(`
      CREATE TABLE "warehouses" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" UUID,
        "updated_by" UUID,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "company_id" UUID NOT NULL,
        "branch_id" UUID,
        "business_unit_id" UUID,
        "warehouse_code" VARCHAR(50) NOT NULL,
        "name" VARCHAR(255) NOT NULL,
        "warehouse_type" VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
        "address" VARCHAR(255),
        "city" VARCHAR(100),
        "country" VARCHAR(100),
        "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        CONSTRAINT "PK_warehouses_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_warehouses_code_company" UNIQUE ("warehouse_code", "company_id")
      )
    `);

    // Indexes for warehouses
    await queryRunner.query(`CREATE INDEX "IDX_warehouses_company_id" ON "warehouses" ("company_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_warehouses_branch_id" ON "warehouses" ("branch_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_warehouses_business_unit_id" ON "warehouses" ("business_unit_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_warehouses_warehouse_code" ON "warehouses" ("warehouse_code")`);
    await queryRunner.query(`CREATE INDEX "IDX_warehouses_status" ON "warehouses" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_warehouses_warehouse_type" ON "warehouses" ("warehouse_type")`);

    // Foreign keys for warehouses
    await queryRunner.query(`
      ALTER TABLE "warehouses" ADD CONSTRAINT "FK_warehouses_company"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "warehouses" ADD CONSTRAINT "FK_warehouses_branch"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "warehouses" ADD CONSTRAINT "FK_warehouses_business_unit"
      FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // Warehouse Locations table
    await queryRunner.query(`
      CREATE TABLE "warehouse_locations" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" UUID,
        "updated_by" UUID,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "warehouse_id" UUID NOT NULL,
        "location_code" VARCHAR(50) NOT NULL,
        "name" VARCHAR(255) NOT NULL,
        "description" TEXT,
        "parent_location_id" UUID,
        "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        CONSTRAINT "PK_warehouse_locations_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_warehouse_locations_code_warehouse" UNIQUE ("location_code", "warehouse_id")
      )
    `);

    // Indexes for warehouse locations
    await queryRunner.query(`CREATE INDEX "IDX_warehouse_locations_warehouse_id" ON "warehouse_locations" ("warehouse_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_warehouse_locations_parent_location_id" ON "warehouse_locations" ("parent_location_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_warehouse_locations_location_code" ON "warehouse_locations" ("location_code")`);
    await queryRunner.query(`CREATE INDEX "IDX_warehouse_locations_status" ON "warehouse_locations" ("status")`);

    // Foreign keys for warehouse locations
    await queryRunner.query(`
      ALTER TABLE "warehouse_locations" ADD CONSTRAINT "FK_warehouse_locations_warehouse"
      FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "warehouse_locations" ADD CONSTRAINT "FK_warehouse_locations_parent_location"
      FOREIGN KEY ("parent_location_id") REFERENCES "warehouse_locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order
    await queryRunner.query(`DROP TABLE "warehouse_locations"`);
    await queryRunner.query(`DROP TABLE "warehouses"`);
    await queryRunner.query(`DROP TABLE "departments"`);
    await queryRunner.query(`DROP TABLE "business_units"`);
    await queryRunner.query(`DROP TABLE "branches"`);
    await queryRunner.query(`DROP TABLE "companies"`);
  }
}
