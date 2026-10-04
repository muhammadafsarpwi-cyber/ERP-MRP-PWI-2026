const jwt = require('jsonwebtoken');

const JWT_SECRET = 'dev-jwt-secret-not-for-production';

// The DIV-CCD-only user from the database
const userId = '98d2e7c7-75af-44ab-a60a-190ac260a4ec'; // erp_users.id for Anus Anees ur Rehman
const authUserId = '3c8bbf43-d64c-4bb6-b762-ea7b54cf8813'; // auth_user_id from erp_users

// Create a local JWT token (pwi-local-auth issuer)
const token = jwt.sign({
  sub: authUserId,
  email: 'Anasccd71@gmail.com',
  role: 'PRODUCTION',
  iss: 'pwi-local-auth',
  erpUserId: userId
}, JWT_SECRET, { expiresIn: '1h' });

console.log('Token:', token);