import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSalesCustomerMasterAndLedger1799000000000 implements MigrationInterface {
  name = 'CreateSalesCustomerMasterAndLedger1799000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Extend customers table
    await queryRunner.query(`
      ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "legal_name" varchar(255);
      ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "customer_category" varchar(50) DEFAULT 'STANDARD';
      ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "customer_group" varchar(50) DEFAULT 'GENERAL';
      ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "customer_since" date;
      ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "tax_status" varchar(50) DEFAULT 'REGISTERED';
      ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "classification" varchar(50);
      ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "sales_tax_number" varchar(100);
      ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "opening_balance" decimal(15,4) DEFAULT 0;
      ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "opening_balance_type" varchar(10) DEFAULT 'DEBIT';
      ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "price_list" varchar(100) DEFAULT 'STANDARD';
      ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "credit_hold" boolean DEFAULT false;
      ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "credit_hold_reason" text;
    `);

    // 2. Extend customer_addresses table
    await queryRunner.query(`
      ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "area" varchar(100);
      ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "contact_person" varchar(150);
      ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "phone" varchar(50);
    `);

    // 3. Extend customer_contacts table
    await queryRunner.query(`
      ALTER TABLE "customer_contacts" ADD COLUMN IF NOT EXISTS "designation" varchar(100);
      ALTER TABLE "customer_contacts" ADD COLUMN IF NOT EXISTS "alternate_contact" varchar(150);
      ALTER TABLE "customer_contacts" ADD COLUMN IF NOT EXISTS "alternate_phone" varchar(50);
    `);

    // 4. Create authoritative customer_ledger table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_ledger" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "is_active" boolean NOT NULL DEFAULT true,
        "company_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "transaction_date" date NOT NULL,
        "document_type" varchar(50) NOT NULL DEFAULT 'OPENING_BALANCE',
        "document_number" varchar(100) NOT NULL,
        "reference" varchar(255),
        "debit" decimal(15,4) NOT NULL DEFAULT 0,
        "credit" decimal(15,4) NOT NULL DEFAULT 0,
        "running_balance" decimal(15,4) NOT NULL DEFAULT 0,
        "currency" varchar(3) NOT NULL DEFAULT 'PKR',
        "due_date" date,
        "payment_terms" varchar(50),
        "status" varchar(20) NOT NULL DEFAULT 'POSTED',
        "notes" text,
        CONSTRAINT "fk_customer_ledger_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS "idx_customer_ledger_company_customer" ON "customer_ledger"("company_id", "customer_id", "transaction_date");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_ledger";`);
  }
}
