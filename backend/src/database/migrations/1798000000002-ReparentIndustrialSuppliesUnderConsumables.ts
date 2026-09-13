import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Re-parent Industrial Supplies (CAT-CONS-IND) under Consumables (CAT-CONS).
 *
 * Following the hierarchy cleanup (CreateItemCategoryHierarchy):
 * CAT-CONS-IND  ("Industrial consumable supplies") was the only remaining
 * mis-nested child — it sat under the Work in Progress master, which is now a
 * root. Its own description ("Industrial consumable supplies") places it under
 * Consumables. Non-destructive: no items are re-parented (CONS-001 keeps its
 * category), only the category's parent is corrected.
 */
export class ReparentIndustrialSuppliesUnderConsumables1798000000002 implements MigrationInterface {
  name = 'ReparentIndustrialSuppliesUnderConsumables1798000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE item_categories c
         SET parent_category_id = (SELECT id FROM item_categories WHERE category_code = 'CAT-CONS' LIMIT 1),
             updated_at = NOW()
       WHERE c.category_code = 'CAT-CONS-IND'
         AND (SELECT cc.category_code FROM item_categories cc WHERE cc.id = c.parent_category_id) = 'CAT-WIP'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE item_categories c
         SET parent_category_id = (SELECT id FROM item_categories WHERE category_code = 'CAT-WIP' LIMIT 1),
             updated_at = NOW()
       WHERE c.category_code = 'CAT-CONS-IND'
         AND (SELECT cc.category_code FROM item_categories cc WHERE cc.id = c.parent_category_id) = 'CAT-CONS'
    `);
  }
}