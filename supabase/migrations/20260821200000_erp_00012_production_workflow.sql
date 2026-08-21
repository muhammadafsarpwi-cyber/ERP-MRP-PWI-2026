-- ============================================================================
-- PROMPT-04: Production Workflow — Production Orders & Operations
-- Migration: 20260821200000_erp_00012_production_workflow.sql
--
-- Purpose:
--   1. Create production_orders table (product-driven manufacturing orders)
--   2. Create production_order_operations table (execution snapshot per order)
--   3. Create production_order_operation_logs table (append-only execution history)
--   4. Create production permissions and grant them to SUPER_ADMIN
--
-- Safety:
--   - All operations idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING)
--   - No primary keys changed
--   - No existing tables altered destructively
--   - No data destroyed
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: production_orders
-- Product-driven: routing + BOM must belong to the same product.
-- Status lifecycle: DRAFT → RELEASED → IN_PROGRESS → COMPLETED
-- Cancellation: DRAFT → CANCELLED, RELEASED → CANCELLED only.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS production_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  order_number VARCHAR(50) NOT NULL,
  product_id UUID NOT NULL REFERENCES items(id),
  bom_id UUID REFERENCES bill_of_materials(id),
  routing_id UUID NOT NULL REFERENCES production_routings(id),
  division_id UUID REFERENCES divisions(id),
  planned_quantity DECIMAL(19,4) NOT NULL DEFAULT 0 CHECK (planned_quantity > 0),
  completed_quantity DECIMAL(19,4) NOT NULL DEFAULT 0,
  scrapped_quantity DECIMAL(19,4) NOT NULL DEFAULT 0,
  uom_id UUID NOT NULL REFERENCES uoms(id),
  raw_material_warehouse_id UUID REFERENCES warehouses(id),
  wip_warehouse_id UUID REFERENCES warehouses(id),
  finished_goods_warehouse_id UUID REFERENCES warehouses(id),
  priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  demand_source VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
  sales_order_item_id UUID,
  planned_start_date TIMESTAMPTZ,
  planned_end_date TIMESTAMPTZ,
  actual_start_date TIMESTAMPTZ,
  actual_end_date TIMESTAMPTZ,
  due_date DATE,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT uq_production_orders_company_number UNIQUE (company_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_prod_orders_company ON production_orders (company_id);
CREATE INDEX IF NOT EXISTS idx_prod_orders_product ON production_orders (product_id);
CREATE INDEX IF NOT EXISTS idx_prod_orders_routing ON production_orders (routing_id);
CREATE INDEX IF NOT EXISTS idx_prod_orders_bom ON production_orders (bom_id);
CREATE INDEX IF NOT EXISTS idx_prod_orders_division ON production_orders (division_id);
CREATE INDEX IF NOT EXISTS idx_prod_orders_status ON production_orders (status);
CREATE INDEX IF NOT EXISTS idx_prod_orders_so_item ON production_orders (sales_order_item_id);

COMMENT ON TABLE production_orders IS 'Production Orders: product-driven manufacturing orders snapshotting a routing at release.';
COMMENT ON COLUMN production_orders.demand_source IS 'CUSTOMER_ORDER | SAFETY_STOCK | MANUAL';
COMMENT ON COLUMN production_orders.status IS 'DRAFT | RELEASED | IN_PROGRESS | COMPLETED | CANCELLED';
COMMENT ON COLUMN production_orders.priority IS 'LOW | NORMAL | HIGH | URGENT | CRITICAL';
COMMENT ON COLUMN production_orders.sales_order_item_id IS 'Optional link to erp_sales.sales_order_items when demand_source=CUSTOMER_ORDER';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: production_order_operations
-- Execution snapshot copied from routing_operations at RELEASE.
-- Updating these rows never modifies the original routing.
-- Operation status: PENDING → IN_PROGRESS → COMPLETED
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS production_order_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  routing_operation_id UUID REFERENCES routing_operations(id),
  sequence_no INTEGER NOT NULL,
  operation_code VARCHAR(50) NOT NULL,
  operation_name VARCHAR(255) NOT NULL,
  description TEXT,
  division_id UUID REFERENCES divisions(id),
  section_id UUID REFERENCES sections(id),
  department_id UUID REFERENCES departments(id),
  setup_time_minutes DECIMAL(19,4) NOT NULL DEFAULT 0,
  run_time_minutes DECIMAL(19,4) NOT NULL DEFAULT 0,
  planned_quantity DECIMAL(19,4) NOT NULL DEFAULT 0,
  input_quantity DECIMAL(19,4),
  output_quantity DECIMAL(19,4),
  scrapped_quantity DECIMAL(19,4) NOT NULL DEFAULT 0,
  uom_id UUID REFERENCES uoms(id),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  actual_start_date TIMESTAMPTZ,
  actual_end_date TIMESTAMPTZ,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT uq_po_operations_seq UNIQUE (production_order_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_po_ops_order ON production_order_operations (production_order_id);
CREATE INDEX IF NOT EXISTS idx_po_ops_dept ON production_order_operations (department_id);
CREATE INDEX IF NOT EXISTS idx_po_ops_division ON production_order_operations (division_id);
CREATE INDEX IF NOT EXISTS idx_po_ops_status ON production_order_operations (status);

COMMENT ON TABLE production_order_operations IS 'Per-order execution snapshot of routing operations; independent of the source routing after release.';
COMMENT ON COLUMN production_order_operations.status IS 'PENDING | IN_PROGRESS | COMPLETED';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: production_order_operation_logs
-- Append-only history. Previous operation results are never overwritten.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS production_order_operation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  production_order_operation_id UUID NOT NULL REFERENCES production_order_operations(id) ON DELETE CASCADE,
  event_type VARCHAR(20) NOT NULL,
  input_quantity DECIMAL(19,4),
  output_quantity DECIMAL(19,4),
  scrapped_quantity DECIMAL(19,4),
  notes TEXT,
  logged_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_op_logs_op ON production_order_operation_logs (production_order_operation_id);
CREATE INDEX IF NOT EXISTS idx_po_op_logs_company ON production_order_operation_logs (company_id);

COMMENT ON TABLE production_order_operation_logs IS 'Append-only operation execution history (STARTED / COMPLETED events).';
COMMENT ON COLUMN production_order_operation_logs.event_type IS 'STARTED | COMPLETED';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: Production permissions + SUPER_ADMIN grants
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO permissions (permission_code, name, description, module, resource, action, is_active, created_at, updated_at)
VALUES
  ('manufacturing.production.orders.view',      'View Production Orders',        'View production orders',                    'manufacturing', 'production-orders',     'view',    true, now(), now()),
  ('manufacturing.production.orders.create',    'Create Production Orders',      'Create production orders',                  'manufacturing', 'production-orders',     'create',  true, now(), now()),
  ('manufacturing.production.orders.update',    'Update Production Orders',      'Update draft production orders',            'manufacturing', 'production-orders',     'update',  true, now(), now()),
  ('manufacturing.production.orders.delete',    'Delete Production Orders',      'Delete draft production orders',            'manufacturing', 'production-orders',     'delete',  true, now(), now()),
  ('manufacturing.production.orders.release',   'Release Production Orders',     'Release production orders to production',   'manufacturing', 'production-orders',     'release', true, now(), now()),
  ('manufacturing.production.orders.cancel',    'Cancel Production Orders',      'Cancel production orders',                  'manufacturing', 'production-orders',     'cancel',  true, now(), now()),
  ('manufacturing.production.operations.execute','Execute Production Operations','Start/complete production operations',      'manufacturing', 'production-operations', 'execute', true, now(), now()),
  ('manufacturing.production.issue',            'Issue Materials to Production', 'Issue raw materials against production orders', 'manufacturing', 'production-materials', 'issue', true, now(), now()),
  ('manufacturing.production.receipt',          'Receive Finished Goods',        'Record finished goods receipt from production', 'manufacturing', 'production-receipts', 'receipt', true, now(), now()),
  ('manufacturing.production.planning.view',    'View Production Planning',      'View production planning dashboard',        'manufacturing', 'production-planning',   'view',    true, now(), now())
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, status, is_active, created_at, updated_at)
SELECT r.id, p.id, 'ACTIVE', true, now(), now()
FROM roles r
JOIN permissions p ON p.permission_code IN (
  'manufacturing.production.orders.view',
  'manufacturing.production.orders.create',
  'manufacturing.production.orders.update',
  'manufacturing.production.orders.delete',
  'manufacturing.production.orders.release',
  'manufacturing.production.orders.cancel',
  'manufacturing.production.operations.execute',
  'manufacturing.production.issue',
  'manufacturing.production.receipt',
  'manufacturing.production.planning.view'
)
WHERE r.role_code = 'SUPER_ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

COMMIT;
