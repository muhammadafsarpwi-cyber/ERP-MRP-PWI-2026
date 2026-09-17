const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
  ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
});

async function main() {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS routing_operation_connections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      routing_id UUID NOT NULL REFERENCES production_routings(id) ON DELETE CASCADE,
      from_operation_id UUID NOT NULL REFERENCES routing_operations(id) ON DELETE CASCADE,
      to_operation_id UUID NOT NULL REFERENCES routing_operations(id) ON DELETE CASCADE,
      connection_type VARCHAR(30) NOT NULL DEFAULT 'SEQUENTIAL',
      branch_label VARCHAR(100),
      order_index INTEGER DEFAULT 1,
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      created_by UUID,
      updated_by UUID,
      is_active BOOLEAN DEFAULT TRUE,
      CONSTRAINT chk_no_self_connection CHECK (from_operation_id <> to_operation_id),
      CONSTRAINT uq_routing_op_connection UNIQUE (routing_id, from_operation_id, to_operation_id)
    );

    CREATE INDEX IF NOT EXISTS idx_roc_routing_id ON routing_operation_connections(routing_id);
    CREATE INDEX IF NOT EXISTS idx_roc_from_op ON routing_operation_connections(from_operation_id);
    CREATE INDEX IF NOT EXISTS idx_roc_to_op ON routing_operation_connections(to_operation_id);
  `);
  console.log('✅ routing_operation_connections table verified/created successfully');

  // Check columns
  const cols = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'routing_operation_connections'
    ORDER BY ordinal_position;
  `);
  console.log('Columns in routing_operation_connections:');
  console.log(cols.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));

  await client.end();
}

main().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
