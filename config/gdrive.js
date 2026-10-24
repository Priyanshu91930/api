import crypto from 'crypto';

const GDRIVE_FOLDER_ID = process.env.GDRIVE_FOLDER_ID || '118k0rLdLlVRrCha6YbwQMd3jv2yOdi_O';

/**
 * Base64 URL safe encode
 */
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generate Google OAuth2 Access Token using Service Account Private Key
 * (Pure Node.js Crypto - No heavy SDK required!)
 */
async function getGoogleAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaimSet = base64UrlEncode(JSON.stringify(claimSet));
  const unsignedToken = `${encodedHeader}.${encodedClaimSet}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(credentials.private_key, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const jwt = `${unsignedToken}.${signature}`;

  // Request OAuth2 Access Token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (tokenData.access_token) {
    return tokenData.access_token;
  }
  throw new Error(`Google Auth Failed: ${tokenData.error_description || JSON.stringify(tokenData)}`);
}

/**
 * Get Service Account Credentials from Env or Config
 */
function getCredentials() {
  if (process.env.GDRIVE_SERVICE_ACCOUNT_KEY) {
    try {
      return typeof process.env.GDRIVE_SERVICE_ACCOUNT_KEY === 'string'
        ? JSON.parse(process.env.GDRIVE_SERVICE_ACCOUNT_KEY)
        : process.env.GDRIVE_SERVICE_ACCOUNT_KEY;
    } catch (e) {
      console.error('Failed to parse GDRIVE_SERVICE_ACCOUNT_KEY env:', e);
    }
  }
  return null;
}

/**
 * Upload Image Buffer to Google Drive via Multipart REST API
 */
export async function uploadImageToDrive(buffer, fileName = 'thumb.jpg', mimeType = 'image/jpeg') {
  const credentials = getCredentials();
  if (!credentials) {
    throw new Error('GDRIVE_SERVICE_ACCOUNT_KEY is not configured in Vercel environment variables');
  }

  const accessToken = await getGoogleAccessToken(credentials);

  // 1. Prepare Multipart Body for Google Drive API v3
  const boundary = '-------LinkWalaDriveBoundary' + Date.now();
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: `thumb_${Date.now()}_${fileName}`,
    parents: [GDRIVE_FOLDER_ID],
  };

  const multipartBody = Buffer.concat([
    Buffer.from(
      `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) +
      `${delimiter}Content-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n`
    ),
    Buffer.from(buffer.toString('base64')),
    Buffer.from(closeDelimiter),
  ]);

  // 2. Upload file
  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );

  const fileData = await uploadRes.json();
  if (!fileData.id) {
    throw new Error(`Google Drive upload failed: ${JSON.stringify(fileData)}`);
  }

  const fileId = fileData.id;
  console.log(`✅ Uploaded to Google Drive successfully! File ID: ${fileId}`);

  // 3. Set public permission (Anyone with link can view)
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone',
    }),
  }).catch(() => {});

  // 4. Return Direct High-Speed CDN URL
  const directCdnUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
  return {
    fileId,
    directCdnUrl,
  };
}
