const http = require('http');
const { DataSource } = require('./node_modules/typeorm');
require('./node_modules/dotenv').config();

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'pwi_erp',
});

async function main() {
  await ds.initialize();
  // Get admin user
  const users = await ds.query("SELECT id, email, password_hash FROM users WHERE status = 'ACTIVE' LIMIT 1");
  console.log('User email:', users[0].email);
  await ds.destroy();

  // Sign a JWT token using JWT_SECRET
  const jwt = require('./node_modules/jsonwebtoken');
  const secret = process.env.JWT_SECRET || 'secret';
  const token = jwt.sign({ sub: users[0].id, email: users[0].email }, secret, { expiresIn: '1h' });

  // Call API with Bearer token
  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/production/inventory-report?itemId=94831f9f-c358-4da1-b570-fe1daa0092b9',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('HTTP Status:', res.statusCode);
      try {
        const json = JSON.parse(body);
        const item = json.data?.items?.[0];
        console.log('REPORT ITEM:', JSON.stringify(item, null, 2));
      } catch (e) {
        console.log('BODY:', body);
      }
    });
  });
  req.on('error', console.error);
  req.end();
}

main().catch(console.error);
