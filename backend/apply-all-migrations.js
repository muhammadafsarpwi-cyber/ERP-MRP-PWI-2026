const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const c = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function runSql(conn, sql, label) {
  try {
    const r = await conn.query(sql);
    if (label) console.log(`  OK: ${label}`);
    return r;
  } catch (e) {
    console.error(`  FAIL: ${label || 'query'}: ${e.message.split('\n')[0]}`);
    throw e;
  }
}

async function runMigrationFile(conn, filePath, label) {
  const sql = fs.readFileSync(filePath, 'utf8');
  console.log(`\n--- ${label} ---`);
  // Split by semicolons but handle $$ blocks properly
  const statements = [];
  let current = '';
  let inDollarQuote = false;
  
  for (const line of sql.split('\n')) {
    // Skip comments
    const trimmed = line.trim();
    if (trimmed.startsWith('--') && !trimmed.startsWith('--$')) {
      current += '\n';
      continue;
    }
    
    current += line + '\n';
    
    // Track dollar quoting
    const dollarMatches = line.match(/\$\$/g);
    if (dollarMatches) {
      inDollarQuote = !inDollarQuote;
    }
    
    // If we hit a semicolon and we're not in dollar quoting, that's end of statement
    if (trimmed.endsWith(';') && !inDollarQuote) {
      statements.push(current.trim());
      current = '';
    }
  }
  
  if (current.trim()) statements.push(current.trim());
  
  let ok = 0, fail = 0;
  for (const stmt of statements) {
    if (!stmt || stmt.length < 10) continue;
    try {
      await conn.query(stmt);
      ok++;
    } catch (e) {
      // Skip already-exists errors
      if (e.code === '42710' || e.code === '42P07' || e.code === '23505' || e.code === '42P16') {
        fail++;
        // silently skip duplicates
      } else {
        console.error(`  STATEMENT FAIL: ${e.message.split('\n')[0]}`);
        console.error(`  SQL: ${stmt.substring(0, 200)}...`);
        fail++;
      }
    }
  }
  console.log(`  Statements: ${ok} OK, ${fail} skipped/errors`);
}

async function main() {
  await c.connect();
  console.log('Connected to database');

  // =====================================================
  // STEP 0: Fix user_roles - add missing updated_by column
  // =====================================================
  console.log('\n=== STEP 0: Fix user_roles.updated_by ===');
  await runSql(c, `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_roles' AND column_name = 'updated_by'
      ) THEN
        ALTER TABLE user_roles ADD COLUMN updated_by UUID;
        RAISE NOTICE 'Added updated_by to user_roles';
      ELSE
        RAISE NOTICE 'user_roles.updated_by already exists';
      END IF;
    END $$;
  `, 'user_roles.updated_by fix');

  // =====================================================
  // STEP 1: Inventory Management (Migration 4)
  // =====================================================
  console.log('\n=== STEP 1: Inventory Management Tables ===');
  await runSql(c, `
    CREATE TABLE IF NOT EXISTS inventory_policies (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID,
        updated_by UUID,
        is_active BOOLEAN DEFAULT true,
        company_id UUID NOT NULL REFERENCES companies(id),
        item_id UUID NOT NULL REFERENCES items(id),
        warehouse_id UUID NOT NULL REFERENCES warehouses(id),
        minimum_stock DECIMAL(15, 4) DEFAULT 0,
        maximum_stock DECIMAL(15, 4) DEFAULT 0,
        reorder_level DECIMAL(15, 4) DEFAULT 0,
        reorder_quantity DECIMAL(15, 4) DEFAULT 0,
        safety_stock DECIMAL(15, 4) DEFAULT 0,
        lead_time_days INTEGER DEFAULT 0,
        preferred_location_id UUID REFERENCES warehouse_locations(id),
        tracking_type VARCHAR(10) DEFAULT 'NONE' CHECK (tracking_type IN ('NONE', 'BATCH', 'SERIAL')),
        allow_negative_stock BOOLEAN DEFAULT false,
        status VARCHAR(20) DEFAULT 'ACTIVE',
        UNIQUE(item_id, warehouse_id)
    );
  `, 'inventory_policies');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS batches (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID,
        updated_by UUID,
        is_active BOOLEAN DEFAULT true,
        company_id UUID NOT NULL REFERENCES companies(id),
        item_id UUID NOT NULL REFERENCES items(id),
        warehouse_id UUID NOT NULL REFERENCES warehouses(id),
        location_id UUID REFERENCES warehouse_locations(id),
        batch_number VARCHAR(100) NOT NULL,
        manufacturing_date DATE,
        expiry_date DATE,
        supplier_reference VARCHAR(255),
        quantity DECIMAL(15, 4) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'QUARANTINE', 'CONSUMED', 'CLOSED')),
        UNIQUE(batch_number, item_id, company_id)
    );
  `, 'batches');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS inventory_balances (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID,
        updated_by UUID,
        is_active BOOLEAN DEFAULT true,
        company_id UUID NOT NULL REFERENCES companies(id),
        item_id UUID NOT NULL REFERENCES items(id),
        warehouse_id UUID NOT NULL REFERENCES warehouses(id),
        location_id UUID REFERENCES warehouse_locations(id),
        batch_id UUID REFERENCES batches(id),
        uom_id UUID NOT NULL REFERENCES uoms(id),
        on_hand DECIMAL(15, 4) DEFAULT 0,
        reserved DECIMAL(15, 4) DEFAULT 0,
        available DECIMAL(15, 4) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'ACTIVE'
    );
  `, 'inventory_balances');

  await runSql(c, `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_balances_unique
    ON inventory_balances (
        item_id, warehouse_id,
        COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(batch_id, '00000000-0000-0000-0000-000000000000'::uuid),
        uom_id
    );
  `, 'inventory_balances_unique_idx');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS stock_ledger (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID,
        company_id UUID NOT NULL REFERENCES companies(id),
        transaction_type VARCHAR(30) NOT NULL
            CHECK (transaction_type IN ('RECEIPT', 'ISSUE', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'OPENING', 'RETURN_IN', 'RETURN_OUT', 'SALES_DELIVERY', 'SALES_RETURN')),
        transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        item_id UUID NOT NULL REFERENCES items(id),
        warehouse_id UUID NOT NULL REFERENCES warehouses(id),
        location_id UUID REFERENCES warehouse_locations(id),
        quantity DECIMAL(15, 4) NOT NULL,
        uom_id UUID NOT NULL REFERENCES uoms(id),
        direction VARCHAR(10) NOT NULL CHECK (direction IN ('IN', 'OUT')),
        reference_type VARCHAR(50),
        reference_id UUID,
        reference_number VARCHAR(100),
        batch_id UUID REFERENCES batches(id),
        serial_number VARCHAR(100),
        notes TEXT
    );
  `, 'stock_ledger (with SALES_DELIVERY/SALES_RETURN)');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS stock_adjustments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID,
        updated_by UUID,
        is_active BOOLEAN DEFAULT true,
        company_id UUID NOT NULL REFERENCES companies(id),
        warehouse_id UUID NOT NULL REFERENCES warehouses(id),
        adjustment_code VARCHAR(50) NOT NULL,
        adjustment_type VARCHAR(20) NOT NULL CHECK (adjustment_type IN ('INCREASE', 'DECREASE', 'REVALUATION')),
        reason TEXT,
        status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'CANCELLED')),
        approved_by UUID,
        approved_at TIMESTAMPTZ,
        posted_by UUID,
        posted_at TIMESTAMPTZ,
        UNIQUE(adjustment_code, company_id)
    );
  `, 'stock_adjustments');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS stock_adjustment_lines (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID,
        updated_by UUID,
        is_active BOOLEAN DEFAULT true,
        adjustment_id UUID NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
        item_id UUID NOT NULL REFERENCES items(id),
        location_id UUID REFERENCES warehouse_locations(id),
        batch_id UUID REFERENCES batches(id),
        uom_id UUID NOT NULL REFERENCES uoms(id),
        quantity DECIMAL(15, 4) NOT NULL,
        unit_cost DECIMAL(15, 6),
        notes TEXT
    );
  `, 'stock_adjustment_lines');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS stock_transfers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID,
        updated_by UUID,
        is_active BOOLEAN DEFAULT true,
        company_id UUID NOT NULL REFERENCES companies(id),
        transfer_code VARCHAR(50) NOT NULL,
        from_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
        to_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
        from_location_id UUID REFERENCES warehouse_locations(id),
        to_location_id UUID REFERENCES warehouse_locations(id),
        status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'CANCELLED')),
        approved_by UUID,
        approved_at TIMESTAMPTZ,
        posted_by UUID,
        posted_at TIMESTAMPTZ,
        notes TEXT,
        UNIQUE(transfer_code, company_id)
    );
  `, 'stock_transfers');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS stock_transfer_lines (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID,
        updated_by UUID,
        is_active BOOLEAN DEFAULT true,
        transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
        item_id UUID NOT NULL REFERENCES items(id),
        from_location_id UUID REFERENCES warehouse_locations(id),
        to_location_id UUID REFERENCES warehouse_locations(id),
        batch_id UUID REFERENCES batches(id),
        uom_id UUID NOT NULL REFERENCES uoms(id),
        quantity DECIMAL(15, 4) NOT NULL,
        notes TEXT
    );
  `, 'stock_transfer_lines');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS inventory_reservations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID,
        updated_by UUID,
        is_active BOOLEAN DEFAULT true,
        company_id UUID NOT NULL REFERENCES companies(id),
        item_id UUID NOT NULL REFERENCES items(id),
        warehouse_id UUID NOT NULL REFERENCES warehouses(id),
        location_id UUID REFERENCES warehouse_locations(id),
        batch_id UUID REFERENCES batches(id),
        uom_id UUID NOT NULL REFERENCES uoms(id),
        quantity DECIMAL(15, 4) NOT NULL,
        reserved_by UUID,
        reservation_type VARCHAR(30) DEFAULT 'MANUAL' CHECK (reservation_type IN ('MANUAL', 'ORDER', 'TRANSFER')),
        reference_type VARCHAR(50),
        reference_id UUID,
        status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CONSUMED', 'RELEASED', 'CANCELLED')),
        expires_at TIMESTAMPTZ
    );
  `, 'inventory_reservations');

  // Inventory triggers
  console.log('\n  Creating inventory triggers...');
  const invTriggers = [
    ['inventory_policies', 'update_inventory_policies_updated_at'],
    ['batches', 'update_batches_updated_at'],
    ['inventory_balances', 'update_inventory_balances_updated_at'],
    ['stock_adjustments', 'update_stock_adjustments_updated_at'],
    ['stock_adjustment_lines', 'update_stock_adjustment_lines_updated_at'],
    ['stock_transfers', 'update_stock_transfers_updated_at'],
    ['stock_transfer_lines', 'update_stock_transfer_lines_updated_at'],
    ['inventory_reservations', 'update_inventory_reservations_updated_at'],
  ];
  for (const [table, trigger] of invTriggers) {
    await runSql(c, `
      DROP TRIGGER IF EXISTS ${trigger} ON ${table};
      CREATE TRIGGER ${trigger} BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `, `trigger ${trigger}`);
  }

  // Inventory permissions
  await runSql(c, `
    INSERT INTO permissions (permission_code, name, module, resource, action, description, status) VALUES
        ('inventory.view', 'View Inventory', 'inventory', 'inventory', 'VIEW', 'View inventory overview and balances', 'ACTIVE'),
        ('inventory.reports.view', 'View Inventory Reports', 'inventory', 'inventory', 'VIEW_REPORTS', 'View inventory reports and analytics', 'ACTIVE'),
        ('inventory.policy.create', 'Create Inventory Policy', 'inventory', 'policy', 'CREATE', 'Create inventory policies for items', 'ACTIVE'),
        ('inventory.policy.view', 'View Inventory Policy', 'inventory', 'policy', 'VIEW', 'View inventory policies', 'ACTIVE'),
        ('inventory.policy.update', 'Update Inventory Policy', 'inventory', 'policy', 'UPDATE', 'Update inventory policies', 'ACTIVE'),
        ('inventory.adjustment.create', 'Create Stock Adjustment', 'inventory', 'adjustment', 'CREATE', 'Create stock adjustment entries', 'ACTIVE'),
        ('inventory.adjustment.submit', 'Submit Stock Adjustment', 'inventory', 'adjustment', 'SUBMIT', 'Submit stock adjustments for approval', 'ACTIVE'),
        ('inventory.adjustment.approve', 'Approve Stock Adjustment', 'inventory', 'adjustment', 'APPROVE', 'Approve submitted stock adjustments', 'ACTIVE'),
        ('inventory.adjustment.post', 'Post Stock Adjustment', 'inventory', 'adjustment', 'POST', 'Post approved stock adjustments to ledger', 'ACTIVE'),
        ('inventory.transfer.create', 'Create Stock Transfer', 'inventory', 'transfer', 'CREATE', 'Create stock transfer entries', 'ACTIVE'),
        ('inventory.transfer.approve', 'Approve Stock Transfer', 'inventory', 'transfer', 'APPROVE', 'Approve submitted stock transfers', 'ACTIVE'),
        ('inventory.transfer.post', 'Post Stock Transfer', 'inventory', 'transfer', 'POST', 'Post approved stock transfers to ledger', 'ACTIVE'),
        ('inventory.reservation.view', 'View Inventory Reservations', 'inventory', 'reservation', 'VIEW', 'View inventory reservations', 'ACTIVE'),
        ('inventory.reservation.create', 'Create Inventory Reservation', 'inventory', 'reservation', 'CREATE', 'Create inventory reservations', 'ACTIVE'),
        ('inventory.reservation.release', 'Release Inventory Reservation', 'inventory', 'reservation', 'RELEASE', 'Release inventory reservations', 'ACTIVE'),
        ('inventory.opening_stock.create', 'Create Opening Stock', 'inventory', 'opening_stock', 'CREATE', 'Create opening stock entries', 'ACTIVE'),
        ('inventory.batch.view', 'View Batches', 'inventory', 'batch', 'VIEW', 'View batch/lot tracking data', 'ACTIVE'),
        ('inventory.batch.manage', 'Manage Batches', 'inventory', 'batch', 'MANAGE', 'Create, update, and manage batches', 'ACTIVE'),
        ('inventory.serial.view', 'View Serial Numbers', 'inventory', 'serial', 'VIEW', 'View serial number tracking data', 'ACTIVE'),
        ('inventory.serial.manage', 'Manage Serial Numbers', 'inventory', 'serial', 'MANAGE', 'Create, update, and manage serial numbers', 'ACTIVE')
    ON CONFLICT (permission_code) DO NOTHING;
  `, 'inventory permissions');

  // =====================================================
  // STEP 2: Serial Numbers (Migration 5)
  // =====================================================
  console.log('\n=== STEP 2: Serial Numbers Table ===');
  await runSql(c, `
    CREATE TABLE IF NOT EXISTS serial_numbers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID,
        updated_by UUID,
        is_active BOOLEAN DEFAULT true,
        company_id UUID NOT NULL REFERENCES companies(id),
        item_id UUID NOT NULL REFERENCES items(id),
        warehouse_id UUID NOT NULL REFERENCES warehouses(id),
        location_id UUID REFERENCES warehouse_locations(id),
        serial_number VARCHAR(100) NOT NULL,
        batch_id UUID REFERENCES batches(id),
        status VARCHAR(20) DEFAULT 'IN_STOCK',
        reference_type VARCHAR(50),
        reference_id UUID,
        notes TEXT,
        UNIQUE (company_id, item_id, serial_number)
    );
  `, 'serial_numbers');

  await runSql(c, `
    DROP TRIGGER IF EXISTS update_serial_numbers_updated_at ON serial_numbers;
    CREATE TRIGGER update_serial_numbers_updated_at BEFORE UPDATE ON serial_numbers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `, 'serial_numbers trigger');

  // =====================================================
  // STEP 3: Procurement (Migration 6)
  // =====================================================
  console.log('\n=== STEP 3: Procurement Tables ===');
  await runSql(c, `
    CREATE TABLE IF NOT EXISTS suppliers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
        company_id UUID NOT NULL REFERENCES companies(id),
        supplier_code VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        short_name VARCHAR(100), contact_person VARCHAR(255),
        email VARCHAR(255), phone VARCHAR(50), fax VARCHAR(50), website VARCHAR(255),
        tax_number VARCHAR(100), registration_number VARCHAR(100),
        address_line1 VARCHAR(255), address_line2 VARCHAR(255),
        city VARCHAR(100), state VARCHAR(100), postal_code VARCHAR(20), country VARCHAR(100),
        currency_code VARCHAR(3) DEFAULT 'PKR', payment_terms VARCHAR(50),
        credit_limit DECIMAL(15, 4) DEFAULT 0, lead_time_days INTEGER DEFAULT 0,
        rating INTEGER DEFAULT 0, notes TEXT,
        status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'BLACKLISTED')),
        UNIQUE(supplier_code, company_id)
    );
  `, 'suppliers');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS supplier_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
        company_id UUID NOT NULL REFERENCES companies(id),
        supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        item_id UUID NOT NULL REFERENCES items(id),
        supplier_part_number VARCHAR(100),
        unit_price DECIMAL(15, 6) DEFAULT 0, currency_code VARCHAR(3) DEFAULT 'PKR',
        lead_time_days INTEGER DEFAULT 0, minimum_order_quantity DECIMAL(15, 4) DEFAULT 0,
        notes TEXT, status VARCHAR(20) DEFAULT 'ACTIVE',
        UNIQUE(supplier_id, item_id)
    );
  `, 'supplier_items');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS purchase_requisitions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
        company_id UUID NOT NULL REFERENCES companies(id),
        requisition_code VARCHAR(50) NOT NULL,
        title VARCHAR(255), description TEXT,
        request_type VARCHAR(20) DEFAULT 'STANDARD' CHECK (request_type IN ('STANDARD', 'URGENT', 'BLANKET', 'RECURRING')),
        requested_delivery_date DATE, department VARCHAR(100), project_code VARCHAR(100),
        status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_CONVERTED', 'FULLY_CONVERTED', 'CANCELLED')),
        approved_by UUID, approved_at TIMESTAMPTZ, notes TEXT,
        UNIQUE(requisition_code, company_id)
    );
  `, 'purchase_requisitions');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS purchase_requisition_lines (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
        requisition_id UUID NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
        line_number INTEGER NOT NULL,
        item_id UUID NOT NULL REFERENCES items(id),
        uom_id UUID NOT NULL REFERENCES uoms(id),
        quantity DECIMAL(15, 4) NOT NULL,
        estimated_unit_price DECIMAL(15, 6), estimated_total_price DECIMAL(15, 6),
        required_date DATE,
        warehouse_id UUID REFERENCES warehouses(id), supplier_id UUID REFERENCES suppliers(id),
        justification TEXT, converted_quantity DECIMAL(15, 4) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PARTIALLY_ORDERED', 'FULLY_ORDERED', 'CANCELLED')),
        notes TEXT
    );
  `, 'purchase_requisition_lines');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS request_for_quotations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
        company_id UUID NOT NULL REFERENCES companies(id),
        rfq_code VARCHAR(50) NOT NULL,
        title VARCHAR(255), description TEXT,
        supplier_id UUID NOT NULL REFERENCES suppliers(id),
        requisition_id UUID REFERENCES purchase_requisitions(id),
        issue_date DATE DEFAULT CURRENT_DATE, due_date DATE,
        status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT', 'PARTIAL_RESPONSE', 'RESPONSE_RECEIVED', 'EVALUATED', 'CANCELLED')),
        evaluated_by UUID, evaluated_at TIMESTAMPTZ, notes TEXT,
        UNIQUE(rfq_code, company_id)
    );
  `, 'request_for_quotations');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS rfq_lines (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
        rfq_id UUID NOT NULL REFERENCES request_for_quotations(id) ON DELETE CASCADE,
        line_number INTEGER NOT NULL,
        item_id UUID NOT NULL REFERENCES items(id),
        uom_id UUID NOT NULL REFERENCES uoms(id),
        quantity DECIMAL(15, 4) NOT NULL, notes TEXT
    );
  `, 'rfq_lines');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS quotations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
        company_id UUID NOT NULL REFERENCES companies(id),
        quotation_code VARCHAR(50) NOT NULL,
        rfq_id UUID NOT NULL REFERENCES request_for_quotations(id),
        supplier_id UUID NOT NULL REFERENCES suppliers(id),
        quotation_date DATE DEFAULT CURRENT_DATE, valid_until DATE,
        payment_terms VARCHAR(100), delivery_terms VARCHAR(100),
        total_amount DECIMAL(15, 6) DEFAULT 0,
        discount_percent DECIMAL(5, 2) DEFAULT 0, tax_percent DECIMAL(5, 2) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'RECEIVED' CHECK (status IN ('DRAFT', 'RECEIVED', 'EVALUATED', 'SELECTED', 'REJECTED', 'EXPIRED')),
        evaluated_by UUID, evaluated_at TIMESTAMPTZ, evaluation_notes TEXT, notes TEXT,
        UNIQUE(quotation_code, company_id)
    );
  `, 'quotations (procurement)');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS quotation_lines (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
        quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        line_number INTEGER NOT NULL,
        item_id UUID NOT NULL REFERENCES items(id),
        uom_id UUID NOT NULL REFERENCES uoms(id),
        quantity DECIMAL(15, 4) NOT NULL, unit_price DECIMAL(15, 6) NOT NULL,
        discount_percent DECIMAL(5, 2) DEFAULT 0, total_price DECIMAL(15, 6),
        lead_time_days INTEGER DEFAULT 0, notes TEXT
    );
  `, 'quotation_lines');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS purchase_orders (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
        company_id UUID NOT NULL REFERENCES companies(id),
        po_code VARCHAR(50) NOT NULL,
        supplier_id UUID NOT NULL REFERENCES suppliers(id),
        quotation_id UUID REFERENCES quotations(id),
        requisition_id UUID REFERENCES purchase_requisitions(id),
        order_date DATE DEFAULT CURRENT_DATE, expected_delivery_date DATE,
        delivery_address TEXT, payment_terms VARCHAR(100),
        currency_code VARCHAR(3) DEFAULT 'PKR',
        subtotal DECIMAL(15, 6) DEFAULT 0,
        tax_percent DECIMAL(5, 2) DEFAULT 0, tax_amount DECIMAL(15, 6) DEFAULT 0,
        discount_percent DECIMAL(5, 2) DEFAULT 0, discount_amount DECIMAL(15, 6) DEFAULT 0,
        shipping_cost DECIMAL(15, 6) DEFAULT 0,
        total_amount DECIMAL(15, 6) DEFAULT 0,
        received_amount DECIMAL(15, 6) DEFAULT 0, invoiced_amount DECIMAL(15, 6) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'PARTIALLY_INVOICED', 'FULLY_INVOICED', 'CLOSED', 'CANCELLED')),
        approved_by UUID, approved_at TIMESTAMPTZ,
        received_by UUID, received_at TIMESTAMPTZ,
        cancelled_by UUID, cancelled_at TIMESTAMPTZ, cancellation_reason TEXT, notes TEXT,
        UNIQUE(po_code, company_id)
    );
  `, 'purchase_orders');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS purchase_order_lines (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
        po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        line_number INTEGER NOT NULL,
        item_id UUID NOT NULL REFERENCES items(id),
        uom_id UUID NOT NULL REFERENCES uoms(id),
        quantity DECIMAL(15, 4) NOT NULL, unit_price DECIMAL(15, 6) NOT NULL,
        discount_percent DECIMAL(5, 2) DEFAULT 0, total_price DECIMAL(15, 6),
        received_quantity DECIMAL(15, 4) DEFAULT 0, invoiced_quantity DECIMAL(15, 4) DEFAULT 0,
        warehouse_id UUID REFERENCES warehouses(id),
        required_date DATE, notes TEXT
    );
  `, 'purchase_order_lines');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS goods_receipts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
        company_id UUID NOT NULL REFERENCES companies(id),
        receipt_code VARCHAR(50) NOT NULL,
        po_id UUID NOT NULL REFERENCES purchase_orders(id),
        supplier_id UUID NOT NULL REFERENCES suppliers(id),
        warehouse_id UUID NOT NULL REFERENCES warehouses(id),
        receipt_date TIMESTAMPTZ DEFAULT NOW(),
        delivery_note_number VARCHAR(100), grn_number VARCHAR(100),
        status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'RECEIVED', 'INSPECTION', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'POSTED')),
        inspected_by UUID, inspected_at TIMESTAMPTZ,
        posted_by UUID, posted_at TIMESTAMPTZ, notes TEXT,
        UNIQUE(receipt_code, company_id)
    );
  `, 'goods_receipts');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS goods_receipt_lines (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
        receipt_id UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
        po_line_id UUID NOT NULL REFERENCES purchase_order_lines(id),
        item_id UUID NOT NULL REFERENCES items(id),
        uom_id UUID NOT NULL REFERENCES uoms(id),
        quantity_ordered DECIMAL(15, 4) NOT NULL,
        quantity_received DECIMAL(15, 4) NOT NULL,
        quantity_accepted DECIMAL(15, 4) DEFAULT 0,
        quantity_rejected DECIMAL(15, 4) DEFAULT 0,
        unit_price DECIMAL(15, 6) NOT NULL,
        location_id UUID REFERENCES warehouse_locations(id),
        batch_id UUID REFERENCES batches(id),
        condition_notes TEXT, notes TEXT
    );
  `, 'goods_receipt_lines');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS purchase_returns (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
        company_id UUID NOT NULL REFERENCES companies(id),
        return_code VARCHAR(50) NOT NULL,
        po_id UUID NOT NULL REFERENCES purchase_orders(id),
        supplier_id UUID NOT NULL REFERENCES suppliers(id),
        warehouse_id UUID NOT NULL REFERENCES warehouses(id),
        return_date TIMESTAMPTZ DEFAULT NOW(), reason TEXT,
        status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'SHIPPED', 'RECEIVED_BY_SUPPLIER', 'COMPLETED', 'CANCELLED')),
        approved_by UUID, approved_at TIMESTAMPTZ,
        posted_by UUID, posted_at TIMESTAMPTZ, notes TEXT,
        UNIQUE(return_code, company_id)
    );
  `, 'purchase_returns');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS purchase_return_lines (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
        return_id UUID NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
        po_line_id UUID REFERENCES purchase_order_lines(id),
        item_id UUID NOT NULL REFERENCES items(id),
        uom_id UUID NOT NULL REFERENCES uoms(id),
        quantity DECIMAL(15, 4) NOT NULL,
        unit_price DECIMAL(15, 6) NOT NULL,
        reason TEXT, notes TEXT
    );
  `, 'purchase_return_lines');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS purchase_invoices (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
        company_id UUID NOT NULL REFERENCES companies(id),
        invoice_code VARCHAR(50) NOT NULL,
        supplier_invoice_number VARCHAR(100) NOT NULL,
        po_id UUID NOT NULL REFERENCES purchase_orders(id),
        supplier_id UUID NOT NULL REFERENCES suppliers(id),
        invoice_date DATE DEFAULT CURRENT_DATE, due_date DATE,
        subtotal DECIMAL(15, 6) DEFAULT 0,
        tax_percent DECIMAL(5, 2) DEFAULT 0, tax_amount DECIMAL(15, 6) DEFAULT 0,
        discount_amount DECIMAL(15, 6) DEFAULT 0,
        total_amount DECIMAL(15, 6) DEFAULT 0,
        paid_amount DECIMAL(15, 6) DEFAULT 0,
        currency_code VARCHAR(3) DEFAULT 'PKR',
        payment_status VARCHAR(20) DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PARTIAL', 'PAID', 'OVERPAID')),
        matching_status VARCHAR(20) DEFAULT 'PENDING' CHECK (matching_status IN ('PENDING', 'MATCHED', 'VARIANCE', 'EXCEPTION')),
        variance_amount DECIMAL(15, 6) DEFAULT 0, variance_notes TEXT,
        status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'CANCELLED')),
        approved_by UUID, approved_at TIMESTAMPTZ,
        posted_by UUID, posted_at TIMESTAMPTZ, notes TEXT,
        UNIQUE(invoice_code, company_id)
    );
  `, 'purchase_invoices');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS purchase_invoice_lines (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
        invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
        po_line_id UUID REFERENCES purchase_order_lines(id),
        item_id UUID NOT NULL REFERENCES items(id),
        uom_id UUID NOT NULL REFERENCES uoms(id),
        quantity DECIMAL(15, 4) NOT NULL, unit_price DECIMAL(15, 6) NOT NULL,
        total_price DECIMAL(15, 6), notes TEXT
    );
  `, 'purchase_invoice_lines');

  // Procurement triggers
  console.log('\n  Creating procurement triggers...');
  const procTriggers = [
    ['suppliers', 'update_suppliers_updated_at'],
    ['supplier_items', 'update_supplier_items_updated_at'],
    ['purchase_requisitions', 'update_purchase_requisitions_updated_at'],
    ['purchase_requisition_lines', 'update_purchase_requisition_lines_updated_at'],
    ['request_for_quotations', 'update_request_for_quotations_updated_at'],
    ['rfq_lines', 'update_rfq_lines_updated_at'],
    ['quotations', 'update_quotations_updated_at'],
    ['quotation_lines', 'update_quotation_lines_updated_at'],
    ['purchase_orders', 'update_purchase_orders_updated_at'],
    ['purchase_order_lines', 'update_purchase_order_lines_updated_at'],
    ['goods_receipts', 'update_goods_receipts_updated_at'],
    ['goods_receipt_lines', 'update_goods_receipt_lines_updated_at'],
    ['purchase_returns', 'update_purchase_returns_updated_at'],
    ['purchase_return_lines', 'update_purchase_return_lines_updated_at'],
    ['purchase_invoices', 'update_purchase_invoices_updated_at'],
    ['purchase_invoice_lines', 'update_purchase_invoice_lines_updated_at'],
  ];
  for (const [table, trigger] of procTriggers) {
    await runSql(c, `
      DROP TRIGGER IF EXISTS ${trigger} ON ${table};
      CREATE TRIGGER ${trigger} BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `, `trigger ${trigger}`);
  }

  // Procurement permissions
  await runSql(c, `
    INSERT INTO permissions (permission_code, name, module, resource, action, description, status) VALUES
        ('procurement.supplier.create', 'Create Supplier', 'procurement', 'supplier', 'CREATE', 'Create new suppliers', 'ACTIVE'),
        ('procurement.supplier.view', 'View Suppliers', 'procurement', 'supplier', 'VIEW', 'View suppliers list and details', 'ACTIVE'),
        ('procurement.supplier.update', 'Update Supplier', 'procurement', 'supplier', 'UPDATE', 'Update supplier information', 'ACTIVE'),
        ('procurement.supplier.delete', 'Delete Supplier', 'procurement', 'supplier', 'DELETE', 'Soft delete suppliers', 'ACTIVE'),
        ('procurement.supplier_item.create', 'Create Supplier Item', 'procurement', 'supplier_item', 'CREATE', 'Create supplier item pricing', 'ACTIVE'),
        ('procurement.supplier_item.view', 'View Supplier Items', 'procurement', 'supplier_item', 'VIEW', 'View supplier item catalog', 'ACTIVE'),
        ('procurement.supplier_item.update', 'Update Supplier Item', 'procurement', 'supplier_item', 'UPDATE', 'Update supplier item pricing', 'ACTIVE'),
        ('procurement.requisition.create', 'Create Purchase Requisition', 'procurement', 'requisition', 'CREATE', 'Create purchase requisitions', 'ACTIVE'),
        ('procurement.requisition.view', 'View Purchase Requisitions', 'procurement', 'requisition', 'VIEW', 'View purchase requisitions', 'ACTIVE'),
        ('procurement.requisition.submit', 'Submit Purchase Requisition', 'procurement', 'requisition', 'SUBMIT', 'Submit requisitions for approval', 'ACTIVE'),
        ('procurement.requisition.approve', 'Approve Purchase Requisition', 'procurement', 'requisition', 'APPROVE', 'Approve purchase requisitions', 'ACTIVE'),
        ('procurement.rfq.create', 'Create RFQ', 'procurement', 'rfq', 'CREATE', 'Create request for quotations', 'ACTIVE'),
        ('procurement.rfq.view', 'View RFQs', 'procurement', 'rfq', 'VIEW', 'View request for quotations', 'ACTIVE'),
        ('procurement.rfq.send', 'Send RFQ', 'procurement', 'rfq', 'SEND', 'Send RFQs to suppliers', 'ACTIVE'),
        ('procurement.rfq.evaluate', 'Evaluate RFQ', 'procurement', 'rfq', 'EVALUATE', 'Evaluate RFQ responses', 'ACTIVE'),
        ('procurement.quotation.create', 'Create Quotation', 'procurement', 'quotation', 'CREATE', 'Create supplier quotations', 'ACTIVE'),
        ('procurement.quotation.view', 'View Quotations', 'procurement', 'quotation', 'VIEW', 'View supplier quotations', 'ACTIVE'),
        ('procurement.quotation.evaluate', 'Evaluate Quotation', 'procurement', 'quotation', 'EVALUATE', 'Evaluate and compare quotations', 'ACTIVE'),
        ('procurement.quotation.select', 'Select Quotation', 'procurement', 'quotation', 'SELECT', 'Select winning quotation', 'ACTIVE'),
        ('procurement.order.create', 'Create Purchase Order', 'procurement', 'order', 'CREATE', 'Create purchase orders', 'ACTIVE'),
        ('procurement.order.view', 'View Purchase Orders', 'procurement', 'order', 'VIEW', 'View purchase orders', 'ACTIVE'),
        ('procurement.order.submit', 'Submit Purchase Order', 'procurement', 'order', 'SUBMIT', 'Submit PO for approval', 'ACTIVE'),
        ('procurement.order.approve', 'Approve Purchase Order', 'procurement', 'order', 'APPROVE', 'Approve purchase orders', 'ACTIVE'),
        ('procurement.order.cancel', 'Cancel Purchase Order', 'procurement', 'order', 'CANCEL', 'Cancel purchase orders', 'ACTIVE'),
        ('procurement.receipt.create', 'Create Goods Receipt', 'procurement', 'receipt', 'CREATE', 'Create goods receipts', 'ACTIVE'),
        ('procurement.receipt.view', 'View Goods Receipts', 'procurement', 'receipt', 'VIEW', 'View goods receipts', 'ACTIVE'),
        ('procurement.receipt.inspect', 'Inspect Goods Receipt', 'procurement', 'receipt', 'INSPECT', 'Inspect received goods', 'ACTIVE'),
        ('procurement.receipt.post', 'Post Goods Receipt', 'procurement', 'receipt', 'POST', 'Post goods receipts to inventory', 'ACTIVE'),
        ('procurement.return.create', 'Create Purchase Return', 'procurement', 'return', 'CREATE', 'Create purchase returns', 'ACTIVE'),
        ('procurement.return.view', 'View Purchase Returns', 'procurement', 'return', 'VIEW', 'View purchase returns', 'ACTIVE'),
        ('procurement.return.approve', 'Approve Purchase Return', 'procurement', 'return', 'APPROVE', 'Approve purchase returns', 'ACTIVE'),
        ('procurement.return.post', 'Post Purchase Return', 'procurement', 'return', 'POST', 'Post purchase returns to inventory', 'ACTIVE'),
        ('procurement.invoice.create', 'Create Purchase Invoice', 'procurement', 'invoice', 'CREATE', 'Create purchase invoices', 'ACTIVE'),
        ('procurement.invoice.view', 'View Purchase Invoices', 'procurement', 'invoice', 'VIEW', 'View purchase invoices', 'ACTIVE'),
        ('procurement.invoice.approve', 'Approve Purchase Invoice', 'procurement', 'invoice', 'APPROVE', 'Approve purchase invoices', 'ACTIVE'),
        ('procurement.invoice.post', 'Post Purchase Invoice', 'procurement', 'invoice', 'POST', 'Post purchase invoices to GL', 'ACTIVE')
    ON CONFLICT (permission_code) DO NOTHING;
  `, 'procurement permissions');

  // =====================================================
  // STEP 4: Create missing erp_sales tables
  // (customers, quotations, quotation_items, sales_orders, sales_order_items, sales_invoices)
  // These were NEVER created by any migration file
  // =====================================================
  console.log('\n=== STEP 4: erp_sales Schema Tables (missing from migrations) ===');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS erp_sales.customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        customer_code VARCHAR(30) NOT NULL,
        company_name VARCHAR(200) NOT NULL,
        contact_person VARCHAR(150),
        email VARCHAR(150),
        phone VARCHAR(30),
        mobile VARCHAR(30),
        billing_address TEXT,
        shipping_address TEXT,
        city VARCHAR(100),
        state VARCHAR(100),
        country VARCHAR(100),
        postal_code VARCHAR(20),
        tax_id VARCHAR(50),
        credit_limit DECIMAL(15, 2) DEFAULT 0,
        credit_days INTEGER DEFAULT 0,
        currency VARCHAR(3) DEFAULT 'USD',
        customer_type VARCHAR(20) DEFAULT 'B2B',
        status VARCHAR(20) DEFAULT 'Active',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_by UUID,
        updated_by UUID,
        UNIQUE(customer_code)
    );
  `, 'erp_sales.customers');

  await runSql(c, `
    DROP TRIGGER IF EXISTS update_erp_sales_customers_updated_at ON erp_sales.customers;
    CREATE TRIGGER update_erp_sales_customers_updated_at BEFORE UPDATE ON erp_sales.customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `, 'erp_sales.customers trigger');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS erp_sales.quotations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        quotation_number VARCHAR(50) NOT NULL,
        customer_id UUID NOT NULL REFERENCES erp_sales.customers(id),
        quotation_date DATE,
        valid_until DATE,
        currency VARCHAR(3) DEFAULT 'USD',
        subtotal DECIMAL(15, 4) DEFAULT 0,
        discount_amount DECIMAL(15, 4) DEFAULT 0,
        tax_amount DECIMAL(15, 4) DEFAULT 0,
        total_amount DECIMAL(15, 4) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'Draft',
        notes TEXT,
        sales_rep_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_by UUID,
        UNIQUE(quotation_number)
    );
  `, 'erp_sales.quotations');

  await runSql(c, `
    DROP TRIGGER IF EXISTS update_erp_sales_quotations_updated_at ON erp_sales.quotations;
    CREATE TRIGGER update_erp_sales_quotations_updated_at BEFORE UPDATE ON erp_sales.quotations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `, 'erp_sales.quotations trigger');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS erp_sales.quotation_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        quotation_id UUID NOT NULL REFERENCES erp_sales.quotations(id) ON DELETE CASCADE,
        line_number INTEGER,
        item_id UUID REFERENCES items(id),
        description TEXT,
        quantity DECIMAL(15, 4) DEFAULT 0,
        uom_id UUID REFERENCES uoms(id),
        unit_price DECIMAL(15, 6) DEFAULT 0,
        discount_percent DECIMAL(5, 2) DEFAULT 0,
        tax_amount DECIMAL(15, 4) DEFAULT 0,
        line_total DECIMAL(15, 4) DEFAULT 0,
        delivery_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `, 'erp_sales.quotation_items');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS erp_sales.sales_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        order_number VARCHAR(50) NOT NULL,
        customer_id UUID NOT NULL REFERENCES erp_sales.customers(id),
        quotation_id UUID REFERENCES erp_sales.quotations(id),
        order_date DATE,
        delivery_date DATE,
        ship_to_address TEXT,
        bill_to_address TEXT,
        currency VARCHAR(3) DEFAULT 'USD',
        subtotal DECIMAL(15, 4) DEFAULT 0,
        discount_amount DECIMAL(15, 4) DEFAULT 0,
        tax_amount DECIMAL(15, 4) DEFAULT 0,
        freight_amount DECIMAL(15, 4) DEFAULT 0,
        total_amount DECIMAL(15, 4) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'Draft',
        payment_term_id UUID,
        sales_rep_id UUID,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_by UUID,
        updated_by UUID,
        UNIQUE(order_number)
    );
  `, 'erp_sales.sales_orders');

  await runSql(c, `
    DROP TRIGGER IF EXISTS update_erp_sales_sales_orders_updated_at ON erp_sales.sales_orders;
    CREATE TRIGGER update_erp_sales_sales_orders_updated_at BEFORE UPDATE ON erp_sales.sales_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `, 'erp_sales.sales_orders trigger');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS erp_sales.sales_order_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sales_order_id UUID NOT NULL REFERENCES erp_sales.sales_orders(id) ON DELETE CASCADE,
        line_number INTEGER,
        item_id UUID REFERENCES items(id),
        description TEXT,
        quantity DECIMAL(15, 4) DEFAULT 0,
        shipped_quantity DECIMAL(15, 4) DEFAULT 0,
        uom_id UUID REFERENCES uoms(id),
        unit_price DECIMAL(15, 6) DEFAULT 0,
        discount_percent DECIMAL(5, 2) DEFAULT 0,
        tax_amount DECIMAL(15, 4) DEFAULT 0,
        line_total DECIMAL(15, 4) DEFAULT 0,
        delivery_date DATE,
        status VARCHAR(20) DEFAULT 'Pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `, 'erp_sales.sales_order_items');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS erp_sales.sales_invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        invoice_no VARCHAR(50) NOT NULL,
        sales_order_id UUID REFERENCES erp_sales.sales_orders(id),
        customer_id UUID NOT NULL REFERENCES erp_sales.customers(id),
        invoice_date DATE NOT NULL,
        due_date DATE,
        subtotal DECIMAL(15, 4),
        discount_amount DECIMAL(15, 4),
        tax_amount DECIMAL(15, 4),
        total_amount DECIMAL(15, 4),
        paid_amount DECIMAL(15, 4) DEFAULT 0,
        balance DECIMAL(15, 4),
        status VARCHAR(30) DEFAULT 'Pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_by UUID,
        UNIQUE(invoice_no)
    );
  `, 'erp_sales.sales_invoices');

  await runSql(c, `
    DROP TRIGGER IF EXISTS update_erp_sales_sales_invoices_updated_at ON erp_sales.sales_invoices;
    CREATE TRIGGER update_erp_sales_sales_invoices_updated_at BEFORE UPDATE ON erp_sales.sales_invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `, 'erp_sales.sales_invoices trigger');

  // =====================================================
  // STEP 5: Sales Module Tables (Migration 8)
  // =====================================================
  console.log('\n=== STEP 5: Sales Module Tables (deliveries, returns) ===');
  await runSql(c, `
    CREATE TABLE IF NOT EXISTS erp_sales.sales_deliveries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        delivery_number VARCHAR(50) NOT NULL,
        sales_order_id UUID REFERENCES erp_sales.sales_orders(id),
        customer_id UUID NOT NULL REFERENCES erp_sales.customers(id),
        delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
        expected_date DATE,
        warehouse_id UUID REFERENCES warehouses(id),
        ship_to_address TEXT,
        carrier VARCHAR(100),
        tracking_number VARCHAR(200),
        subtotal NUMERIC(15,4) DEFAULT 0,
        tax_amount NUMERIC(15,4) DEFAULT 0,
        total_amount NUMERIC(15,4) DEFAULT 0,
        status VARCHAR(30) DEFAULT 'DRAFT',
        notes TEXT,
        received_by UUID,
        received_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by UUID,
        updated_by UUID,
        UNIQUE(delivery_number)
    );
  `, 'erp_sales.sales_deliveries');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS erp_sales.sales_delivery_lines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        delivery_id UUID NOT NULL REFERENCES erp_sales.sales_deliveries(id) ON DELETE CASCADE,
        line_number INTEGER NOT NULL,
        item_id UUID NOT NULL REFERENCES items(id),
        description TEXT,
        quantity NUMERIC(15,4) NOT NULL,
        uom_id UUID REFERENCES uoms(id),
        warehouse_id UUID REFERENCES warehouses(id),
        batch_id UUID,
        serial_number VARCHAR(100),
        unit_price NUMERIC(15,6) DEFAULT 0,
        tax_amount NUMERIC(15,4) DEFAULT 0,
        line_total NUMERIC(15,4) DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `, 'erp_sales.sales_delivery_lines');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS erp_sales.sales_returns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        return_number VARCHAR(50) NOT NULL,
        sales_order_id UUID REFERENCES erp_sales.sales_orders(id),
        sales_invoice_id UUID REFERENCES erp_sales.sales_invoices(id),
        customer_id UUID NOT NULL REFERENCES erp_sales.customers(id),
        return_date DATE NOT NULL DEFAULT CURRENT_DATE,
        reason TEXT,
        subtotal NUMERIC(15,4) DEFAULT 0,
        tax_amount NUMERIC(15,4) DEFAULT 0,
        total_amount NUMERIC(15,4) DEFAULT 0,
        status VARCHAR(30) DEFAULT 'DRAFT',
        notes TEXT,
        approved_by UUID,
        approved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by UUID,
        updated_by UUID,
        UNIQUE(return_number)
    );
  `, 'erp_sales.sales_returns');

  await runSql(c, `
    CREATE TABLE IF NOT EXISTS erp_sales.sales_return_lines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        return_id UUID NOT NULL REFERENCES erp_sales.sales_returns(id) ON DELETE CASCADE,
        line_number INTEGER NOT NULL,
        item_id UUID NOT NULL REFERENCES items(id),
        description TEXT,
        quantity NUMERIC(15,4) NOT NULL,
        uom_id UUID REFERENCES uoms(id),
        unit_price NUMERIC(15,6) DEFAULT 0,
        tax_amount NUMERIC(15,4) DEFAULT 0,
        line_total NUMERIC(15,4) DEFAULT 0,
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `, 'erp_sales.sales_return_lines');

  // Sales triggers
  console.log('\n  Creating sales triggers...');
  const salesTriggers = [
    ['erp_sales.sales_deliveries', 'trg_sd_updated_at'],
    ['erp_sales.sales_returns', 'trg_sr_updated_at'],
  ];
  for (const [table, trigger] of salesTriggers) {
    await runSql(c, `
      DROP TRIGGER IF EXISTS ${trigger} ON ${table};
      CREATE TRIGGER ${trigger} BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `, `trigger ${trigger}`);
  }

  // Sales permissions
  await runSql(c, `
    INSERT INTO permissions (permission_code, name, module, resource, action, description, status) VALUES
        ('sales.quotations.view', 'View Sales Quotations', 'sales', 'quotations', 'VIEW', 'View sales quotations', 'ACTIVE'),
        ('sales.quotations.create', 'Create Sales Quotations', 'sales', 'quotations', 'CREATE', 'Create sales quotations', 'ACTIVE'),
        ('sales.quotations.update', 'Update Sales Quotations', 'sales', 'quotations', 'UPDATE', 'Update sales quotations', 'ACTIVE'),
        ('sales.quotations.delete', 'Delete Sales Quotations', 'sales', 'quotations', 'DELETE', 'Delete sales quotations', 'ACTIVE'),
        ('sales.orders.view', 'View Sales Orders', 'sales', 'orders', 'VIEW', 'View sales orders', 'ACTIVE'),
        ('sales.orders.create', 'Create Sales Orders', 'sales', 'orders', 'CREATE', 'Create sales orders', 'ACTIVE'),
        ('sales.orders.update', 'Update Sales Orders', 'sales', 'orders', 'UPDATE', 'Update sales orders', 'ACTIVE'),
        ('sales.orders.approve', 'Approve Sales Orders', 'sales', 'orders', 'APPROVE', 'Approve sales orders', 'ACTIVE'),
        ('sales.deliveries.view', 'View Deliveries', 'sales', 'deliveries', 'VIEW', 'View sales deliveries', 'ACTIVE'),
        ('sales.deliveries.create', 'Create Deliveries', 'sales', 'deliveries', 'CREATE', 'Create sales deliveries', 'ACTIVE'),
        ('sales.deliveries.update', 'Update Deliveries', 'sales', 'deliveries', 'UPDATE', 'Update sales deliveries', 'ACTIVE'),
        ('sales.deliveries.confirm', 'Confirm Deliveries', 'sales', 'deliveries', 'CONFIRM', 'Confirm sales deliveries', 'ACTIVE'),
        ('sales.invoices.view', 'View Sales Invoices', 'sales', 'invoices', 'VIEW', 'View sales invoices', 'ACTIVE'),
        ('sales.invoices.create', 'Create Sales Invoices', 'sales', 'invoices', 'CREATE', 'Create sales invoices', 'ACTIVE'),
        ('sales.invoices.update', 'Update Sales Invoices', 'sales', 'invoices', 'UPDATE', 'Update sales invoices', 'ACTIVE'),
        ('sales.invoices.post', 'Post Sales Invoices', 'sales', 'invoices', 'POST', 'Post sales invoices', 'ACTIVE'),
        ('sales.returns.view', 'View Sales Returns', 'sales', 'returns', 'VIEW', 'View sales returns', 'ACTIVE'),
        ('sales.returns.create', 'Create Sales Returns', 'sales', 'returns', 'CREATE', 'Create sales returns', 'ACTIVE'),
        ('sales.returns.approve', 'Approve Sales Returns', 'sales', 'returns', 'APPROVE', 'Approve sales returns', 'ACTIVE')
    ON CONFLICT (permission_code) DO NOTHING;
  `, 'sales permissions');

  // Grant sales permissions to ADMIN and SUPER_ADMIN
  await runSql(c, `
    INSERT INTO role_permissions (role_id, permission_id, status)
    SELECT r.id, p.id, 'ACTIVE'
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.role_code = 'ADMIN' AND p.module = 'sales'
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  `, 'sales permissions -> ADMIN');

  await runSql(c, `
    INSERT INTO role_permissions (role_id, permission_id, status)
    SELECT r.id, p.id, 'ACTIVE'
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.role_code = 'SUPER_ADMIN' AND p.module = 'sales'
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  `, 'sales permissions -> SUPER_ADMIN');

  // =====================================================
  // STEP 6: Demo Data Seed
  // =====================================================
  console.log('\n=== STEP 6: Demo Data Seed ===');
  await runSql(c, `
    DO $$
    DECLARE
        v_company_id UUID;
        v_cust1 UUID; v_cust2 UUID; v_cust3 UUID; v_cust4 UUID; v_cust5 UUID;
        v_cust6 UUID; v_cust7 UUID; v_cust8 UUID; v_cust9 UUID; v_cust10 UUID;
        v_item1 UUID; v_item2 UUID; v_item3 UUID;
        v_uom_ea UUID; v_uom_box UUID;
        v_wh1 UUID; v_wh2 UUID;
        v_so1 UUID; v_so2 UUID; v_so3 UUID; v_so4 UUID; v_so5 UUID;
        v_so6 UUID; v_so7 UUID; v_so8 UUID; v_so9 UUID; v_so10 UUID;
        v_inv1 UUID; v_inv2 UUID;
    BEGIN
        SELECT id INTO v_company_id FROM companies LIMIT 1;
        IF v_company_id IS NULL THEN RAISE NOTICE 'No company found, skipping seed'; RETURN; END IF;

        SELECT id INTO v_uom_ea FROM uoms WHERE code = 'EA' LIMIT 1;
        SELECT id INTO v_uom_box FROM uoms WHERE code = 'BOX' LIMIT 1;
        IF v_uom_ea IS NULL THEN SELECT id INTO v_uom_ea FROM uoms LIMIT 1; END IF;

        SELECT id INTO v_wh1 FROM warehouses WHERE company_id = v_company_id LIMIT 1;
        SELECT id INTO v_wh2 FROM warehouses WHERE company_id = v_company_id OFFSET 1 LIMIT 1;
        IF v_wh1 IS NULL THEN
            INSERT INTO warehouses (company_id, warehouse_code, name, status)
            VALUES (v_company_id, 'WH-MAIN-001', 'Main Warehouse', 'ACTIVE')
            ON CONFLICT (warehouse_code, company_id) DO NOTHING
            RETURNING id INTO v_wh1;
        END IF;
        IF v_wh2 IS NULL THEN v_wh2 := v_wh1; END IF;

        -- Demo customers
        INSERT INTO erp_sales.customers (company_id, customer_code, company_name, contact_person, email, phone, city, country, currency, credit_limit, credit_days, status)
        VALUES (v_company_id, 'SC-0001', 'Engineering Solutions Ltd', 'Ali Raza', 'ali.raza@engsol.pk', '+92-21-34567890', 'Karachi', 'Pakistan', 'PKR', 500000, 30, 'Active')
        ON CONFLICT (customer_code) DO NOTHING;
        SELECT id INTO v_cust1 FROM erp_sales.customers WHERE customer_code = 'SC-0001';

        INSERT INTO erp_sales.customers (company_id, customer_code, company_name, contact_person, email, phone, city, country, currency, credit_limit, credit_days, status)
        VALUES (v_company_id, 'SC-0002', 'National Trading Corporation', 'Saira Khan', 'saira@nattrading.pk', '+92-42-37654321', 'Lahore', 'Pakistan', 'PKR', 750000, 45, 'Active')
        ON CONFLICT (customer_code) DO NOTHING;
        SELECT id INTO v_cust2 FROM erp_sales.customers WHERE customer_code = 'SC-0002';

        INSERT INTO erp_sales.customers (company_id, customer_code, company_name, contact_person, email, phone, city, country, currency, credit_limit, credit_days, status)
        VALUES (v_company_id, 'SC-0003', 'TechStart Pakistan Pvt Ltd', 'Bilal Ahmed', 'bilal@techstart.pk', '+92-51-23456789', 'Islamabad', 'Pakistan', 'PKR', 300000, 30, 'Active')
        ON CONFLICT (customer_code) DO NOTHING;
        SELECT id INTO v_cust3 FROM erp_sales.customers WHERE customer_code = 'SC-0003';

        INSERT INTO erp_sales.customers (company_id, customer_code, company_name, contact_person, email, phone, city, country, currency, credit_limit, credit_days, status)
        VALUES (v_company_id, 'SC-0004', 'Metro Wholesale Market', 'Usman Malik', 'usman@metrowholesale.pk', '+92-21-38765432', 'Karachi', 'Pakistan', 'PKR', 1000000, 60, 'Active')
        ON CONFLICT (customer_code) DO NOTHING;
        SELECT id INTO v_cust4 FROM erp_sales.customers WHERE customer_code = 'SC-0004';

        INSERT INTO erp_sales.customers (company_id, customer_code, company_name, contact_person, email, phone, city, country, currency, credit_limit, credit_days, status)
        VALUES (v_company_id, 'SC-0005', 'Green Valley Industries', 'Fatima Shah', 'fatima@greenvalley.pk', '+92-42-36547890', 'Lahore', 'Pakistan', 'PKR', 450000, 30, 'Active')
        ON CONFLICT (customer_code) DO NOTHING;
        SELECT id INTO v_cust5 FROM erp_sales.customers WHERE customer_code = 'SC-0005';

        INSERT INTO erp_sales.customers (company_id, customer_code, company_name, contact_person, email, phone, city, country, currency, credit_limit, credit_days, status)
        VALUES (v_company_id, 'SC-0006', 'Blue Star Electronics', 'Omar Farooq', 'omar@bluestar.pk', '+92-21-35678901', 'Karachi', 'Pakistan', 'PKR', 100000, 0, 'Active')
        ON CONFLICT (customer_code) DO NOTHING;
        SELECT id INTO v_cust6 FROM erp_sales.customers WHERE customer_code = 'SC-0006';

        INSERT INTO erp_sales.customers (company_id, customer_code, company_name, contact_person, email, phone, city, country, currency, credit_limit, credit_days, status)
        VALUES (v_company_id, 'SC-0007', 'Frontier Construction Co', 'Zahid Hussain', 'zahid@frontierconst.pk', '+92-91-23456789', 'Peshawar', 'Pakistan', 'PKR', 2000000, 90, 'Active')
        ON CONFLICT (customer_code) DO NOTHING;
        SELECT id INTO v_cust7 FROM erp_sales.customers WHERE customer_code = 'SC-0007';

        INSERT INTO erp_sales.customers (company_id, customer_code, company_name, contact_person, email, phone, city, country, currency, credit_limit, credit_days, status)
        VALUES (v_company_id, 'SC-0008', 'Sindh Textile Mills', 'Ayesha Noor', 'ayesha@sindhtextile.pk', '+92-21-39876543', 'Karachi', 'Pakistan', 'PKR', 600000, 45, 'Active')
        ON CONFLICT (customer_code) DO NOTHING;
        SELECT id INTO v_cust8 FROM erp_sales.customers WHERE customer_code = 'SC-0008';

        INSERT INTO erp_sales.customers (company_id, customer_code, company_name, contact_person, email, phone, city, country, currency, credit_limit, credit_days, status)
        VALUES (v_company_id, 'SC-0009', 'Pakistan Dairy Products', 'Hassan Ali', 'hassan@pakdairy.pk', '+92-42-38765433', 'Lahore', 'Pakistan', 'PKR', 350000, 30, 'Active')
        ON CONFLICT (customer_code) DO NOTHING;
        SELECT id INTO v_cust9 FROM erp_sales.customers WHERE customer_code = 'SC-0009';

        INSERT INTO erp_sales.customers (company_id, customer_code, company_name, contact_person, email, phone, city, country, currency, credit_limit, credit_days, status)
        VALUES (v_company_id, 'SC-0010', 'Kabul Export House', 'Ahmad Wali', 'ahmad@kabulexport.af', '+93-700-123456', 'Kabul', 'Afghanistan', 'USD', 50000, 60, 'Active')
        ON CONFLICT (customer_code) DO NOTHING;
        SELECT id INTO v_cust10 FROM erp_sales.customers WHERE customer_code = 'SC-0010';

        -- Items
        SELECT id INTO v_item1 FROM items WHERE company_id = v_company_id AND is_sellable = true LIMIT 1;
        IF v_item1 IS NULL THEN
            INSERT INTO items (company_id, item_code, name, base_uom_id, selling_price, is_sellable, track_inventory, status)
            VALUES (v_company_id, 'SLD-0001', 'Industrial Widget', v_uom_ea, 2500.0000, true, true, 'ACTIVE')
            ON CONFLICT (item_code, company_id) DO NOTHING;
            SELECT id INTO v_item1 FROM items WHERE item_code = 'SLD-0001' AND company_id = v_company_id;
        END IF;

        SELECT id INTO v_item2 FROM items WHERE company_id = v_company_id AND is_sellable = true OFFSET 1 LIMIT 1;
        IF v_item2 IS NULL OR v_item2 = v_item1 THEN
            INSERT INTO items (company_id, item_code, name, base_uom_id, selling_price, is_sellable, track_inventory, status)
            VALUES (v_company_id, 'SLD-0002', 'Premium Component Kit', v_uom_box, 15000.0000, true, true, 'ACTIVE')
            ON CONFLICT (item_code, company_id) DO NOTHING;
            SELECT id INTO v_item2 FROM items WHERE item_code = 'SLD-0002' AND company_id = v_company_id;
        END IF;

        SELECT id INTO v_item3 FROM items WHERE company_id = v_company_id AND is_sellable = true OFFSET 2 LIMIT 1;
        IF v_item3 IS NULL OR v_item3 IN (v_item1, v_item2) THEN
            INSERT INTO items (company_id, item_code, name, base_uom_id, selling_price, is_sellable, track_inventory, status)
            VALUES (v_company_id, 'SLD-0003', 'Specialty Fastener Pack', v_uom_ea, 450.0000, true, true, 'ACTIVE')
            ON CONFLICT (item_code, company_id) DO NOTHING;
            SELECT id INTO v_item3 FROM items WHERE item_code = 'SLD-0003' AND company_id = v_company_id;
        END IF;

        IF v_item2 IS NULL OR v_item2 = v_item1 THEN v_item2 := v_item1; END IF;
        IF v_item3 IS NULL OR v_item3 IN (v_item1, v_item2) THEN v_item3 := v_item1; END IF;

        -- 10 Quotations
        INSERT INTO erp_sales.quotations (company_id, quotation_number, customer_id, quotation_date, valid_until, currency, subtotal, discount_amount, tax_amount, total_amount, status, notes)
        VALUES
            (v_company_id, 'QT-2026-00001', v_cust1, '2026-07-01', '2026-08-01', 'PKR', 250000, 12500, 45000, 282500, 'Accepted', 'Bulk order for engineering parts'),
            (v_company_id, 'QT-2026-00002', v_cust2, '2026-07-05', '2026-08-05', 'PKR', 450000, 22500, 81000, 508500, 'Sent', 'Quarterly supply quotation'),
            (v_company_id, 'QT-2026-00003', v_cust3, '2026-07-10', '2026-08-10', 'PKR', 120000, 0, 21600, 141600, 'Accepted', 'IT equipment supply'),
            (v_company_id, 'QT-2026-00004', v_cust4, '2026-07-12', '2026-08-12', 'PKR', 800000, 80000, 129600, 849600, 'Draft', 'Wholesale bulk quote'),
            (v_company_id, 'QT-2026-00005', v_cust5, '2026-07-15', '2026-08-15', 'PKR', 320000, 16000, 54720, 358720, 'Sent', 'Industrial components'),
            (v_company_id, 'QT-2026-00006', v_cust6, '2026-07-18', '2026-08-18', 'PKR', 75000, 3750, 12825, 84075, 'Rejected', 'Small retail order - declined'),
            (v_company_id, 'QT-2026-00007', v_cust7, '2026-07-20', '2026-08-20', 'PKR', 1500000, 75000, 256500, 1681500, 'Accepted', 'Construction project supply'),
            (v_company_id, 'QT-2026-00008', v_cust8, '2026-07-22', '2026-08-22', 'PKR', 560000, 28000, 96480, 628480, 'Sent', 'Textile mill supply'),
            (v_company_id, 'QT-2026-00009', v_cust9, '2026-07-25', '2026-08-25', 'PKR', 200000, 10000, 34200, 224200, 'Draft', 'Dairy equipment parts'),
            (v_company_id, 'QT-2026-00010', v_cust10, '2026-07-28', '2026-08-28', 'USD', 15000, 750, 0, 14250, 'Accepted', 'Cross-border export order')
        ON CONFLICT (quotation_number) DO NOTHING;

        -- 10 Sales Orders
        INSERT INTO erp_sales.sales_orders (company_id, order_number, customer_id, order_date, delivery_date, currency, subtotal, discount_amount, tax_amount, total_amount, status, notes)
        VALUES
            (v_company_id, 'SO-2026-00001', v_cust1, '2026-07-03', '2026-07-20', 'PKR', 250000, 12500, 45000, 282500, 'Confirmed', 'Confirmed order from QT-001'),
            (v_company_id, 'SO-2026-00002', v_cust2, '2026-07-08', '2026-07-25', 'PKR', 450000, 22500, 81000, 508500, 'Processing', 'Processing quarterly supply'),
            (v_company_id, 'SO-2026-00003', v_cust3, '2026-07-12', '2026-07-28', 'PKR', 120000, 0, 21600, 141600, 'Shipped', 'IT equipment dispatched'),
            (v_company_id, 'SO-2026-00004', v_cust4, '2026-07-15', '2026-08-01', 'PKR', 800000, 80000, 129600, 849600, 'Draft', 'Pending approval for bulk'),
            (v_company_id, 'SO-2026-00005', v_cust5, '2026-07-18', '2026-08-05', 'PKR', 320000, 16000, 54720, 358720, 'Confirmed', 'Industrial components order'),
            (v_company_id, 'SO-2026-00006', v_cust7, '2026-07-22', '2026-08-10', 'PKR', 1500000, 75000, 256500, 1681500, 'Delivered', 'Construction project delivered'),
            (v_company_id, 'SO-2026-00007', v_cust8, '2026-07-25', '2026-08-12', 'PKR', 560000, 28000, 96480, 628480, 'Confirmed', 'Textile mill order'),
            (v_company_id, 'SO-2026-00008', v_cust10, '2026-07-28', '2026-08-15', 'PKR', 15000, 750, 0, 14250, 'Shipped', 'Export order shipped'),
            (v_company_id, 'SO-2026-00009', v_cust1, '2026-08-01', '2026-08-20', 'PKR', 180000, 9000, 32400, 203400, 'Processing', 'Repeat order'),
            (v_company_id, 'SO-2026-00010', v_cust9, '2026-08-05', '2026-08-25', 'PKR', 200000, 10000, 34200, 224200, 'Draft', 'New dairy equipment order')
        ON CONFLICT (order_number) DO NOTHING;

        -- Get SO IDs
        SELECT id INTO v_so1 FROM erp_sales.sales_orders WHERE order_number = 'SO-2026-00001';
        SELECT id INTO v_so2 FROM erp_sales.sales_orders WHERE order_number = 'SO-2026-00002';
        SELECT id INTO v_so3 FROM erp_sales.sales_orders WHERE order_number = 'SO-2026-00003';
        SELECT id INTO v_so6 FROM erp_sales.sales_orders WHERE order_number = 'SO-2026-00006';
        SELECT id INTO v_so8 FROM erp_sales.sales_orders WHERE order_number = 'SO-2026-00008';

        -- 10 Deliveries
        INSERT INTO erp_sales.sales_deliveries (company_id, delivery_number, sales_order_id, customer_id, delivery_date, warehouse_id, subtotal, tax_amount, total_amount, status, notes)
        VALUES
            (v_company_id, 'DN-2026-00001', v_so1, v_cust1, '2026-07-18', v_wh1, 250000, 45000, 295000, 'Delivered', 'First delivery completed'),
            (v_company_id, 'DN-2026-00002', v_so2, v_cust2, '2026-07-22', v_wh1, 225000, 40500, 265500, 'Shipped', 'Partial shipment'),
            (v_company_id, 'DN-2026-00003', v_so3, v_cust3, '2026-07-26', v_wh2, 120000, 21600, 141600, 'Delivered', 'IT equipment delivered'),
            (v_company_id, 'DN-2026-00004', v_so6, v_cust7, '2026-08-05', v_wh1, 1500000, 256500, 1756500, 'Delivered', 'Full construction supply'),
            (v_company_id, 'DN-2026-00005', v_so8, v_cust10, '2026-08-10', v_wh2, 15000, 0, 15000, 'Shipped', 'Export shipment in transit'),
            (v_company_id, 'DN-2026-00006', v_so1, v_cust1, '2026-07-25', v_wh1, 0, 0, 0, 'Draft', 'Second delivery pending'),
            (v_company_id, 'DN-2026-00007', v_so2, v_cust2, '2026-07-30', v_wh1, 225000, 40500, 265500, 'Shipped', 'Second partial shipment'),
            (v_company_id, 'DN-2026-00008', v_so6, v_cust7, '2026-08-08', v_wh1, 0, 0, 0, 'Draft', 'Remaining items pending'),
            (v_company_id, 'DN-2026-00009', v_so3, v_cust3, '2026-08-01', v_wh2, 60000, 10800, 70800, 'Confirmed', 'Additional items confirmed'),
            (v_company_id, 'DN-2026-00010', v_so8, v_cust10, '2026-08-12', v_wh2, 15000, 0, 15000, 'Delivered', 'Export delivery confirmed')
        ON CONFLICT (delivery_number) DO NOTHING;

        -- 10 Invoices
        INSERT INTO erp_sales.sales_invoices (company_id, invoice_no, sales_order_id, customer_id, invoice_date, due_date, subtotal, discount_amount, tax_amount, total_amount, paid_amount, status)
        VALUES
            (v_company_id, 'SI-2026-00001', v_so1, v_cust1, '2026-07-20', '2026-08-19', 250000, 12500, 45000, 282500, 282500, 'Paid'),
            (v_company_id, 'SI-2026-00002', v_so2, v_cust2, '2026-07-25', '2026-09-08', 225000, 11250, 40500, 254250, 0, 'Pending'),
            (v_company_id, 'SI-2026-00003', v_so3, v_cust3, '2026-07-28', '2026-08-27', 120000, 0, 21600, 141600, 141600, 'Paid'),
            (v_company_id, 'SI-2026-00004', v_so6, v_cust7, '2026-08-08', '2026-11-06', 1500000, 75000, 256500, 1681500, 500000, 'Partial'),
            (v_company_id, 'SI-2026-00005', v_so8, v_cust10, '2026-08-12', '2026-10-11', 15000, 750, 0, 14250, 0, 'Pending'),
            (v_company_id, 'SI-2026-00006', v_so1, v_cust1, '2026-07-28', '2026-08-27', 0, 0, 0, 0, 0, 'Draft'),
            (v_company_id, 'SI-2026-00007', v_so2, v_cust2, '2026-08-01', '2026-09-15', 225000, 11250, 40500, 254250, 100000, 'Partial'),
            (v_company_id, 'SI-2026-00008', v_so6, v_cust7, '2026-08-12', '2026-11-10', 0, 0, 0, 0, 0, 'Draft'),
            (v_company_id, 'SI-2026-00009', v_so3, v_cust3, '2026-08-05', '2026-09-04', 60000, 0, 10800, 70800, 0, 'Pending'),
            (v_company_id, 'SI-2026-00010', v_so8, v_cust10, '2026-08-15', '2026-10-14', 15000, 750, 0, 14250, 14250, 'Paid')
        ON CONFLICT (invoice_no) DO NOTHING;

        -- Get invoice IDs for returns
        SELECT id INTO v_inv1 FROM erp_sales.sales_invoices WHERE invoice_no = 'SI-2026-00003';
        SELECT id INTO v_inv2 FROM erp_sales.sales_invoices WHERE invoice_no = 'SI-2026-00001';

        -- 10 Returns
        INSERT INTO erp_sales.sales_returns (company_id, return_number, sales_order_id, sales_invoice_id, customer_id, return_date, reason, subtotal, tax_amount, total_amount, status, notes)
        VALUES
            (v_company_id, 'SR-2026-00001', v_so3, v_inv1, v_cust3, '2026-08-02', 'Defective item - 2 units', 5000, 900, 5900, 'Received', '2 defective widgets returned'),
            (v_company_id, 'SR-2026-00002', v_so1, v_inv2, v_cust1, '2026-08-05', 'Wrong item shipped', 12500, 2250, 14750, 'Approved', 'Wrong part number delivered'),
            (v_company_id, 'SR-2026-00003', v_so2, NULL, v_cust2, '2026-08-08', 'Excess quantity received', 30000, 5400, 35400, 'Draft', 'Customer received 10 extra units'),
            (v_company_id, 'SR-2026-00004', v_so6, v_inv1, v_cust7, '2026-08-10', 'Damaged in transit', 75000, 12600, 87600, 'Refunded', 'Full refund for damaged goods'),
            (v_company_id, 'SR-2026-00005', v_so8, v_inv2, v_cust10, '2026-08-12', 'Quality issue', 3000, 0, 3000, 'Received', 'Quality inspection failed'),
            (v_company_id, 'SR-2026-00006', v_so3, NULL, v_cust3, '2026-08-15', 'Exchange request', 8000, 1440, 9440, 'Draft', 'Customer wants different model'),
            (v_company_id, 'SR-2026-00007', v_so1, v_inv2, v_cust1, '2026-08-18', 'Overstock return', 20000, 3600, 23600, 'Approved', 'Excess inventory return'),
            (v_company_id, 'SR-2026-00008', v_so2, NULL, v_cust2, '2026-08-20', 'Specification mismatch', 15000, 2700, 17700, 'Cancelled', 'Return cancelled - customer kept items'),
            (v_company_id, 'SR-2026-00009', v_so6, v_inv1, v_cust7, '2026-08-22', 'Partial delivery return', 45000, 7650, 52650, 'Received', 'Partial return from large order'),
            (v_company_id, 'SR-2026-00010', v_so8, v_inv2, v_cust10, '2026-08-25', 'Export compliance issue', 7500, 0, 7500, 'Draft', 'Documentation issue')
        ON CONFLICT (return_number) DO NOTHING;

        RAISE NOTICE 'All demo data seeded successfully';
    END $$;
  `, 'demo data seed');

  // =====================================================
  // STEP 7: Verify
  // =====================================================
  console.log('\n=== STEP 7: Verification ===');
  const tables = [
    // Existing (should still work)
    'companies', 'divisions', 'uoms', 'uom_conversions', 'roles', 'permissions',
    'role_permissions', 'erp_users', 'user_roles', 'warehouses', 'warehouse_locations',
    'items', 'item_categories', 'item_barcodes', 'customers',
    // New: inventory
    'inventory_policies', 'batches', 'inventory_balances', 'stock_ledger',
    'stock_adjustments', 'stock_adjustment_lines', 'stock_transfers', 'stock_transfer_lines',
    'inventory_reservations', 'serial_numbers',
    // New: procurement
    'suppliers', 'supplier_items', 'purchase_requisitions', 'purchase_requisition_lines',
    'request_for_quotations', 'rfq_lines', 'purchase_orders', 'purchase_order_lines',
    'goods_receipts', 'goods_receipt_lines', 'purchase_returns', 'purchase_return_lines',
    'purchase_invoices', 'purchase_invoice_lines',
    // New: erp_sales
    'erp_sales.customers', 'erp_sales.quotations', 'erp_sales.quotation_items',
    'erp_sales.sales_orders', 'erp_sales.sales_order_items',
    'erp_sales.sales_deliveries', 'erp_sales.sales_delivery_lines',
    'erp_sales.sales_invoices', 'erp_sales.sales_returns', 'erp_sales.sales_return_lines',
  ];

  for (const tbl of tables) {
    try {
      const r = await c.query('SELECT COUNT(*)::int AS cnt FROM ' + tbl);
      console.log(`  ${tbl.padEnd(35)} EXISTS (${r.rows[0].cnt} rows)`);
    } catch(e) {
      console.log(`  ${tbl.padEnd(35)} MISSING: ${e.message.split('\n')[0]}`);
    }
  }

  await c.end();
  console.log('\nDone!');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
