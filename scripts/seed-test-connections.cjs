const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.gnvobiwlzezostzjpqvu',
    password: 'pwiAfsar74()',
    database: 'postgres',
    ssl: { rejectUnauthorized: false, servername: 'db.gnvobiwlzezostzjpqvu.supabase.co' }
  });
  await client.connect();

  const ops = await client.query(`
    SELECT id, routing_id, sequence_no, operation_code, operation_name 
    FROM routing_operations 
    WHERE routing_id = 'a6f9ce93-2769-4b99-b1ea-784d240c1081'
    ORDER BY sequence_no
  `);
  console.log('Operations for DBGRTG644551:', ops.rows);

  if (ops.rows.length >= 4) {
    // Let's create a branch and merge in routing_operation_connections for DBGRTG644551!
    // op0 -> op1 (Branch), op0 -> op2 (Branch), op1 -> op3 (Merge), op2 -> op3 (Merge)
    const companyId = '7725aa04-a270-4314-9e82-90949cbe7791';
    const routingId = 'a6f9ce93-2769-4b99-b1ea-784d240c1081';
    const [opA, opB, opC, opD] = ops.rows;

    await client.query(`DELETE FROM routing_operation_connections WHERE routing_id = $1`, [routingId]);

    // opA -> opB (Branch Inner)
    await client.query(`
      INSERT INTO routing_operation_connections (company_id, routing_id, from_operation_id, to_operation_id, connection_type, branch_label, order_index)
      VALUES ($1, $2, $3, $4, 'BRANCH', 'Inner Line', 1)
    `, [companyId, routingId, opA.id, opB.id]);

    // opA -> opC (Branch Outer)
    await client.query(`
      INSERT INTO routing_operation_connections (company_id, routing_id, from_operation_id, to_operation_id, connection_type, branch_label, order_index)
      VALUES ($1, $2, $3, $4, 'BRANCH', 'Outer Line', 2)
    `, [companyId, routingId, opA.id, opC.id]);

    // opB -> opD (Merge)
    await client.query(`
      INSERT INTO routing_operation_connections (company_id, routing_id, from_operation_id, to_operation_id, connection_type, branch_label, order_index)
      VALUES ($1, $2, $3, $4, 'MERGE', null, 1)
    `, [companyId, routingId, opB.id, opD.id]);

    // opC -> opD (Merge)
    await client.query(`
      INSERT INTO routing_operation_connections (company_id, routing_id, from_operation_id, to_operation_id, connection_type, branch_label, order_index)
      VALUES ($1, $2, $3, $4, 'MERGE', null, 2)
    `, [companyId, routingId, opC.id, opD.id]);

    console.log('Created branch & merge connections for DBGRTG644551!');
  }

  await client.end();
}

main().catch(console.error);
