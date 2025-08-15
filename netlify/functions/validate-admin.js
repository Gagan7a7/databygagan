// Netlify serverless function for admin password validation
exports.handler = async function(event, context) {
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'MyPortfolio@P@ssword77';
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
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } else {
    return {
      statusCode: 401,
      body: JSON.stringify({ success: false, error: 'Incorrect password' })
    };
  }
};
