import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationsTable1787472000000 implements MigrationInterface {
  name = 'CreateNotificationsTable1787472000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" UUID,
        "updated_by" UUID,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "user_id" UUID NOT NULL,
        "type" VARCHAR(50) NOT NULL,
        "title" VARCHAR(200) NOT NULL,
        "message" VARCHAR(500),
        "entity_type" VARCHAR(50),
        "entity_id" UUID,
        "is_read" BOOLEAN NOT NULL DEFAULT false,
        "read_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_notifications" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_notifications_user_read"
      ON "notifications" ("user_id", "is_read")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ux_notifications_user_entity"
      ON "notifications" ("user_id", "entity_type", "entity_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
  }
}
