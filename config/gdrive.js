import os
import { google } from 'googleapis';
import path from 'path';

const GDRIVE_FOLDER_ID = process.env.GDRIVE_FOLDER_ID || '118k0rLdLlVRrCha6YbwQMd3jv2yOdi_O';

/**
 * Initialize Google Drive Client using Service Account Credentials
 */
function getDriveClient() {
  let credentials;

  // Option 1: Load from Environment Variable (for Vercel deployment)
  if (process.env.GDRIVE_SERVICE_ACCOUNT_KEY) {
    try {
      credentials = JSON.parse(process.env.GDRIVE_SERVICE_ACCOUNT_KEY);
    } catch (e) {
      console.warn('Failed to parse GDRIVE_SERVICE_ACCOUNT_KEY from env:', e.message);
    }
  }

  // Option 2: Load from local config/gdrive_credentials.json file
  if (!credentials) {
    const credPath = path.join(process.cwd(), 'config', 'gdrive_credentials.json');
    if (os.platform() === 'win32' || fs.existsSync(credPath)) {
      try {
        const fileContent = fs.readFileSync(credPath, 'utf8');
        credentials = JSON.parse(fileContent);
      } catch (e) {}
    }
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  return google.drive({ version: 'v3', auth });
}

import fs from 'fs';
import { Readable } from 'stream';

/**
 * Upload Image Buffer or Stream to Google Drive
 * Sets public permission and returns high-speed CDN URL
 */
export async function uploadImageToDrive(bufferOrStream, fileName = 'thumb.jpg', mimeType = 'image/jpeg') {
  try {
    const drive = getDriveClient();

    let bodyStream;
    if (Buffer.isBuffer(bufferOrStream)) {
      bodyStream = new Readable();
      bodyStream.push(bufferOrStream);
      bodyStream.push(null);
    } else {
      bodyStream = bufferOrStream;
    }

    const fileMetadata = {
      name: `thumb_${Date.now()}_${fileName}`,
      parents: [GDRIVE_FOLDER_ID],
    };

    const media = {
      mimeType,
      body: bodyStream,
    };

    // 1. Upload File to Folder
    const res = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name',
    });

    const fileId = res.data.id;
    console.log(`✅ Uploaded to Google Drive with File ID: ${fileId}`);

    // 2. Make File Publicly Viewable
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    // 3. High-Speed Google CDN URL (Super fast, no buffering, perfect for apps)
    const directCdnUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
    return {
      fileId,
      directCdnUrl,
      previewUrl: `https://drive.google.com/file/d/${fileId}/view`,
    };
  } catch (error) {
    console.error('❌ Error uploading to Google Drive:', error);
    throw error;
  }
}
