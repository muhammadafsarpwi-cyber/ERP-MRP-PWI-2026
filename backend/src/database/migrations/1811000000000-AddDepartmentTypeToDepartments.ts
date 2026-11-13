import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDepartmentTypeToDepartments1811000000000 implements MigrationInterface {
  name = 'AddDepartmentTypeToDepartments1811000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "departments"
      ADD COLUMN IF NOT EXISTS "department_type" varchar(20) NOT NULL DEFAULT 'PRODUCTION'
    `);

    await queryRunner.query(`
      ALTER TABLE "departments"
      ALTER COLUMN "division_id" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "departments"
      ALTER COLUMN "section_id" DROP NOT NULL
    `);

    await queryRunner.query(`
      UPDATE "departments"
      SET "department_type" = 'CORPORATE'
      WHERE "division_id" IS NULL AND "department_type" = 'PRODUCTION'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_departments_department_type"
      ON "departments" ("department_type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_departments_department_type"`);
    await queryRunner.query(`ALTER TABLE "departments" DROP COLUMN IF EXISTS "department_type"`);
  }
}
