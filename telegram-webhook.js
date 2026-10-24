import { connectDB } from './config/db.js';
import Video from './models/Video.js';
import { uploadImageToDrive } from './config/gdrive.js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CLOUDFLARE_STREAM_URL = process.env.CLOUDFLARE_STREAM_URL || 'https://linkwala.priyanshusolanki62.workers.dev';

/**
 * Send interactive message to Telegram chat
 */
async function sendTelegramMessage(chatId, text, extra = {}) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        ...extra,
      }),
    });
  } catch (err) {
    console.error('Failed to send telegram message:', err);
  }
}

/**
 * Helper to fetch file_path from Telegram Bot API using file_id
 */
async function getTelegramFilePath(fileId) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
  const response = await fetch(url);
  const data = await response.json();
  if (data.ok && data.result) {
    return data.result.file_path;
  }
  throw new Error(data.description || 'Failed to get file path from Telegram');
}

/**
 * Download Telegram photo buffer and upload to Google Drive automatically
 */
async function autoUploadPhotoToDrive(photoFileId) {
  try {
    const filePath = await getTelegramFilePath(photoFileId);
    const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error('Failed to download photo from Telegram');

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadRes = await uploadImageToDrive(buffer, `photo_${Date.now()}.jpg`, 'image/jpeg');
    return uploadRes.directCdnUrl;
  } catch (err) {
    console.error('❌ Auto-upload photo to Google Drive failed:', err.message);
    return '';
  }
}

/**
 * Helper to parse tags and title from message caption
 */
function parseCaption(caption = '') {
  const hashtagRegex = /#(\w+)/g;
  const tags = [];
  let match;
  while ((match = hashtagRegex.exec(caption)) !== null) {
    tags.push(match[1].toLowerCase());
  }

  let thumbnailUrl = '';
  const gdriveMatch = caption.match(/\[(?:thumb|gdrive):([^\]]+)\]/i);
  if (gdriveMatch) {
    let driveVal = gdriveMatch[1].trim();
    if (!driveVal.startsWith('http')) {
      thumbnailUrl = `https://lh3.googleusercontent.com/d/${driveVal}`;
    } else {
      thumbnailUrl = driveVal;
    }
  }

  let cleanTitle = caption
    .replace(/#\w+/g, '')
    .replace(/\[(?:thumb|gdrive):[^\]]+\]/gi, '')
    .trim();

  if (!cleanTitle) {
    cleanTitle = `Video_${Date.now()}`;
  }

  return {
    title: cleanTitle,
    tags: tags.length > 0 ? tags : ['viral'],
    thumbnailUrl,
    isPremium: tags.includes('premium'),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const update = req.body;
    const message = update?.message || update?.channel_post;

    if (!message) {
      return res.status(200).json({ status: 'Ignored: No message payload' });
    }

    const chatId = message.chat.id;
    const text = message.text?.trim() || '';

    // Handle Bot Commands (/start, /help, /stats)
    if (text.startsWith('/start')) {
      await sendTelegramMessage(
        chatId,
        `👋 <b>Welcome to LinkWala Bot!</b>\n\n` +
          `Main aapki videos aur photos ko Google Drive aur Cloudflare me auto-stream karta hoon!\n\n` +
          `<b>Kaise use karein:</b>\n` +
          `• Koi bhi video post/forward karein (with photo/thumbnail)\n` +
          `• Image automatically Google Drive me upload hogi\n` +
          `• Video ka Cloudflare Stream Link instant banega\n\n` +
          `🌐 <b>Official Website:</b> <a href="https://www.tg.linkwala.com">www.tg.linkwala.com</a>`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📢 Join Official Channel', url: 'https://t.me/+PuWfxzC2QEVkNzA1' }],
              [{ text: '🌐 Creator Website', url: 'https://www.tg.linkwala.com' }],
            ],
          },
        }
      );
      return res.status(200).json({ status: 'Handled /start' });
    }

    if (text.startsWith('/stats')) {
      await connectDB();
      const count = await Video.countDocuments();
      await sendTelegramMessage(
        chatId,
        `📊 <b>LinkWala Database Stats:</b>\n\n` +
          `• Total Indexed Videos: <b>${count}</b>\n` +
          `• Google Drive Auto-Sync: <b>Connected</b>\n` +
          `• Cloudflare Edge Cache: <b>Active</b>\n` +
          `• Serverless Status: <b>Online</b>`
      );
      return res.status(200).json({ status: 'Handled /stats' });
    }

    // Video / Document / Photo processing
    const videoObj = message.video || message.document;
    const photoArr = message.photo; // Array of PhotoSizes

    // Dump Channel Handler: Photo posted with video link in caption
    if (photoArr && photoArr.length > 0) {
      const bestPhoto = photoArr[photoArr.length - 1];
      const caption = message.caption || '';
      
      // Auto-upload photo to Google Drive
      const gdriveCdn = await autoUploadPhotoToDrive(bestPhoto.file_id);

      // Check if caption contains a Telegram video/bot link
      const tgLinkMatch = caption.match(/(https?:\/\/t\.me\/[^\s]+)/i);

      if (tgLinkMatch) {
        await connectDB();
        const { title, tags, isPremium } = parseCaption(caption);
        const targetLink = tgLinkMatch[1];

        // Save post into MongoDB Atlas
        const video = await Video.findOneAndUpdate(
          { caption: targetLink },
          {
            title: title || `Post_${Date.now()}`,
            caption,
            telegramFileId: bestPhoto.file_id,
            telegramFilePath: targetLink,
            thumbnailUrl: gdriveCdn,
            tags,
            isPremium,
          },
          { upsert: true, new: true }
        );

        await sendTelegramMessage(
          chatId,
          `✅ <b>Dump Post Synced to LinkWala App!</b> 🎉\n\n` +
            `🎬 <b>Title:</b> ${video.title}\n` +
            `🏷️ <b>Tags:</b> ${tags.map((t) => '#' + t).join(' ')}\n` +
            `🖼️ <b>Google Drive Thumbnail:</b>\n<code>${gdriveCdn}</code>\n\n` +
            `🔗 <b>Target Link:</b>\n<code>${targetLink}</code>`,
          { reply_to_message_id: message.message_id }
        );
        return res.status(200).json({ status: 'Dump post synced to MongoDB & GDrive', id: video._id });
      }

      // If only photo without link
      await sendTelegramMessage(
        chatId,
        `🖼️ <b>Photo Auto-Uploaded to Google Drive!</b>\n\n` +
          `⚡ <b>High-Speed CDN Link:</b>\n<code>${gdriveCdn}</code>`,
        { reply_to_message_id: message.message_id }
      );
      return res.status(200).json({ status: 'Photo uploaded to GDrive' });
    }

    if (!videoObj) {
      if (text) {
        await sendTelegramMessage(
          chatId,
          `📹 Mujhe video (with optional photo/thumbnail) forward karein taaki wo Google Drive + Cloudflare par auto-stream ho sake!`
        );
      }
      return res.status(200).json({ status: 'Handled text' });
    }

    await connectDB();

    const fileId = videoObj.file_id;
    const fileSize = videoObj.file_size || 0;
    const duration = videoObj.duration || 0;
    const caption = message.caption || '';

    let { title, tags, thumbnailUrl, isPremium } = parseCaption(caption);

    // 1. Auto-upload thumbnail if video has an embedded thumbnail or message has photo
    if (!thumbnailUrl) {
      const thumbFileId = videoObj.thumbnail?.file_id || (photoArr && photoArr[photoArr.length - 1]?.file_id);
      if (thumbFileId) {
        console.log('🔄 Auto-uploading thumbnail to Google Drive...');
        thumbnailUrl = await autoUploadPhotoToDrive(thumbFileId);
      }
    }

    // 2. Fetch official file_path from Telegram Bot API
    const filePath = await getTelegramFilePath(fileId);

    // 3. Instant Cloudflare Stream URL
    const streamUrl = `${CLOUDFLARE_STREAM_URL}/stream?path=${encodeURIComponent(filePath)}`;

    // 4. Save directly into MongoDB Atlas
    const video = await Video.findOneAndUpdate(
      { telegramFileId: fileId },
      {
        title,
        caption,
        telegramFileId: fileId,
        telegramFilePath: filePath,
        fileSize,
        duration,
        thumbnailUrl: thumbnailUrl || '',
        tags,
        isPremium,
      },
      { upsert: true, new: true }
    );

    // 5. Send confirmation reply
    await sendTelegramMessage(
      chatId,
      `✅ <b>Video & Thumbnail Auto-Processed!</b> 🎉\n\n` +
        `🎬 <b>Title:</b> ${video.title}\n` +
        `🏷️ <b>Tags:</b> ${tags.map((t) => '#' + t).join(' ')}\n` +
        `📦 <b>Size:</b> ${(fileSize / (1024 * 1024)).toFixed(1)} MB\n` +
        (thumbnailUrl ? `🖼️ <b>GDrive Thumbnail:</b>\n<code>${thumbnailUrl}</code>\n\n` : '\n') +
        `⚡ <b>Cloudflare Stream Link:</b>\n<code>${streamUrl}</code>`,
      {
        reply_to_message_id: message.message_id,
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Video and thumbnail processed successfully',
      video: {
        id: video._id,
        title: video.title,
        thumbnailUrl,
        streamUrl,
      },
    });
  } catch (error) {
    console.error('❌ Error handling telegram webhook:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
