const fs = require('fs');
const path = require('path');

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: 'Method Not Allowed' })
    };
  }

  // Netlify Functions do not natively parse multipart/form-data
  // Use 'busboy' for parsing file uploads
  const Busboy = require('busboy');

  return new Promise((resolve, reject) => {
    const busboy = new Busboy({ headers: event.headers });
    let uploadPath = '';
    let fileName = '';
    let fileBuffer = Buffer.alloc(0);

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
      fileName = Date.now() + '-' + filename.replace(/[^a-zA-Z0-9.]/g, '_');
      uploadPath = path.join(__dirname, '../../assets', fileName);
      file.on('data', data => {
        fileBuffer = Buffer.concat([fileBuffer, data]);
      });
      file.on('end', () => {
        fs.writeFileSync(uploadPath, fileBuffer);
      });
    });

    busboy.on('finish', () => {
      if (fileName) {
        // Return relative path for frontend usage
        resolve({
          statusCode: 200,
          body: JSON.stringify({ success: true, imagePath: 'assets/' + fileName })
        });
      } else {
        resolve({
          statusCode: 400,
          body: JSON.stringify({ success: false, error: 'No file uploaded' })
        });
      }
    });

    busboy.on('error', err => {
      resolve({
        statusCode: 500,
        body: JSON.stringify({ success: false, error: err.message })
      });
    });

    busboy.end(Buffer.from(event.body, event.isBase64Encoded ? 'base64' : undefined));
  });
};
