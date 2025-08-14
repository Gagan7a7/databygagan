const fs = require('fs');
const path = require('path');

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: 'Method Not Allowed' })
    };
  }

  // Use Busboy to parse multipart form data
  const Busboy = require('busboy');
  const cloudinary = require('cloudinary').v2;

  // Configure Cloudinary
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });

  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: event.headers });
    let fileBuffer = Buffer.alloc(0);
    let fileType = '';
    let fileName = '';

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
      fileType = mimetype;
      fileName = filename;
      file.on('data', data => {
        fileBuffer = Buffer.concat([fileBuffer, data]);
      });
    });

    busboy.on('finish', async () => {
      if (!fileBuffer.length) {
        resolve({
          statusCode: 400,
          body: JSON.stringify({ success: false, error: 'No file uploaded' })
        });
        return;
      }
      try {
        // Upload to Cloudinary
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: 'portfolio_uploads' },
          (error, result) => {
            if (error) {
              resolve({
                statusCode: 500,
                body: JSON.stringify({ success: false, error: error.message })
              });
            } else {
              resolve({
                statusCode: 200,
                body: JSON.stringify({ success: true, imagePath: result.secure_url })
              });
            }
          }
        );
        uploadStream.end(fileBuffer);
      } catch (err) {
        resolve({
          statusCode: 500,
          body: JSON.stringify({ success: false, error: err.message })
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
