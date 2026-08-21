const { Client } = require('pg');

const sql = process.argv[2];
if (!sql) {
  console.error('Usage: node run-sql.js "SQL"');
  process.exit(1);
}

const client = new Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.gnvobiwlzezostzjpqvu',
  password: 'pwiAfsar74()',
  database: 'postgres',
});

client.connect()
  .then(() => client.query(sql))
  .then((res) => {
    if (res.rows && res.rows.length) {
      console.log(JSON.stringify(res.rows, null, 2));
    } else {
      console.log(JSON.stringify({ command: res.command, rowCount: res.rowCount }));
    }
    return client.end();
  })
  .catch((err) => {
    console.error('ERROR:', err.message);
    client.end().catch(() => {});
    process.exit(1);
  });
