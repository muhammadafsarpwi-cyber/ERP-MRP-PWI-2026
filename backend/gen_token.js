const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET;
const payload = {
  sub: '5205a16e-1f34-442b-ac33-d85e740081bc',
  email: 'admin@erp.com',
  role: 'authenticated',
  aud: 'authenticated',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600
};
const token = jwt.sign(payload, secret);
console.log(token);
