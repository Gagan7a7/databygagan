const crypto = require('crypto');

// Generate a simple JWT-style HMAC signature
function signToken(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

// Netlify serverless function for admin password validation
exports.handler = async function (event, context) {
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const JWT_SECRET = process.env.JWT_SECRET || 'fallback_local_secret_databygagan_2026';

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: 'Invalid request body' })
    };
  }

  if (body.password === ADMIN_PASSWORD) {
    // Generate token that expires in 24 hours
    const exp = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
    const token = signToken({ role: 'admin', exp: exp }, JWT_SECRET);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, token: token })
    };
  } else {
    return {
      statusCode: 401,
      body: JSON.stringify({ success: false, error: 'Incorrect password' })
    };
  }
};
