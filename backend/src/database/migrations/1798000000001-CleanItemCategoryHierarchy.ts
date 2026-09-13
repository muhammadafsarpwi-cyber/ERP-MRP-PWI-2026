import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Clean Item Category Hierarchy
 *
 * Fixes mangled parent relationships, renames typos, and activates key categories:
 *   A. CAT-RAW  → reparent to root (was wrongly nested under CAT-FIN-CC)
 *   B. CAT-WIP  → reparent to root as canonical "Work in Progress" (was wrongly nested under CAT-RAW-PLST)
 *   C. CAT-PKG-BOX → rename "Boxes & Cartonsccc" to "Boxes & Cartons"
 *   D. CAT-FIN-SPK (Spoke / Bike Spoke, 55 items) → ACTIVE
 *   E. CAT-FIN-ELEC (Electrical Parts) → ACTIVE
 *   F. WIP      → DEACTIVATE (duplicate "Work in Progress" — already INACTIVE, kept for safety)
 */
export class CleanItemCategoryHierarchy1798000000001 implements MigrationInterface {
  name = 'CleanItemCategoryHierarchy1798000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // A. Root CAT-RAW (Raw Materials) — remove the wrong parent (was CAT-FIN-CC)
    await queryRunner.query(`
      UPDATE item_categories
         SET parent_category_id = NULL,
             status = 'ACTIVE',
             updated_at = NOW()
       WHERE category_code = 'CAT-RAW'
         AND status = 'INACTIVE'
    `);

    // B. Root CAT-WIP (canonical "Work in Progress") — remove the wrong parent (was CAT-RAW-PLST)
    await queryRunner.query(`
      UPDATE item_categories
         SET parent_category_id = NULL,
             updated_at = NOW()
       WHERE category_code = 'CAT-WIP'
         AND parent_category_id IS NOT NULL
    `);

    // C. Fix typo "Boxes & Cartonsccc" → "Boxes & Cartons"
    await queryRunner.query(`
      UPDATE item_categories
         SET name = 'Boxes & Cartons',
             updated_at = NOW()
       WHERE category_code = 'CAT-PKG-BOX'
         AND name = 'Boxes & Cartonsccc'
    `);

    // D. Reactivate CAT-FIN-SPK (Spoke / Bike Spoke) — 55 items depend on it
    await queryRunner.query(`
      UPDATE item_categories
         SET status = 'ACTIVE',
             updated_at = NOW()
       WHERE category_code = 'CAT-FIN-SPK'
         AND status = 'INACTIVE'
    `);

    // E. Reactivate CAT-FIN-ELEC (Electrical Parts)
    await queryRunner.query(`
      UPDATE item_categories
         SET status = 'ACTIVE',
             updated_at = NOW()
       WHERE category_code = 'CAT-FIN-ELEC'
         AND status = 'INACTIVE'
    `);

    // F. Ensure duplicate WIP is DEACTIVATE (already INACTIVE — the UPDATE is idempotent)
    await queryRunner.query(`
      UPDATE item_categories
         SET status = 'INACTIVE',
             updated_at = NOW()
       WHERE category_code = 'WIP'
         AND status = 'ACTIVE'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse A — re-nest CAT-RAW under CAT-FIN-CC, deactivate
    await queryRunner.query(`
      UPDATE item_categories c
         SET parent_category_id = (SELECT id FROM item_categories WHERE category_code = 'CAT-FIN-CC' LIMIT 1),
             status = 'INACTIVE',
             updated_at = NOW()
       WHERE c.category_code = 'CAT-RAW'
    `);

    // Reverse B — re-nest CAT-WIP under CAT-RAW-PLST
    await queryRunner.query(`
      UPDATE item_categories c
         SET parent_category_id = (SELECT id FROM item_categories WHERE category_code = 'CAT-RAW-PLST' LIMIT 1),
             updated_at = NOW()
       WHERE c.category_code = 'CAT-WIP'
    `);

    // Reverse C — restore the typo
    await queryRunner.query(`
      UPDATE item_categories
         SET name = 'Boxes & Cartonsccc',
             updated_at = NOW()
       WHERE category_code = 'CAT-PKG-BOX'
         AND name = 'Boxes & Cartons'
    `);

    // Reverse D — deactivate Spoke / Bike Spoke
    await queryRunner.query(`
      UPDATE item_categories
         SET status = 'INACTIVE',
             updated_at = NOW()
       WHERE category_code = 'CAT-FIN-SPK'
         AND status = 'ACTIVE'
    `);

    // Reverse E — deactivate Electrical Parts
    await queryRunner.query(`
      UPDATE item_categories
         SET status = 'INACTIVE',
             updated_at = NOW()
       WHERE category_code = 'CAT-FIN-ELEC'
         AND status = 'ACTIVE'
    `);

    // Reverse F — reactivate the WIP duplicate
    await queryRunner.query(`
      UPDATE item_categories
         SET status = 'ACTIVE',
             updated_at = NOW()
       WHERE category_code = 'WIP'
         AND status = 'INACTIVE'
    `);
  }
}
