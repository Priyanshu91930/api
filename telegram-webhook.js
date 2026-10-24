import { connectDB } from './config/db.js';
import Video from './models/Video.js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

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
 * Helper to parse tags and title from message caption
 * Example caption:
 * "My Super Viral Video #viral #premium [gdrive:https://lh3.googleusercontent.com/d/xyz]"
 */
function parseCaption(caption = '') {
  const hashtagRegex = /#(\w+)/g;
  const tags = [];
  let match;
  while ((match = hashtagRegex.exec(caption)) !== null) {
    tags.push(match[1].toLowerCase());
  }

  // Check Google Drive thumbnail tag e.g. [thumb:https://...] or [gdrive:id]
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

  // Clean title by removing hashtags and thumbnail tags
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

    // We accept videos forwarded to the bot or sent in private channel
    const message = update?.message || update?.channel_post;
    if (!message) {
      return res.status(200).json({ status: 'Ignored: No message payload' });
    }

    const videoObj = message.video || message.document;
    if (!videoObj) {
      return res.status(200).json({ status: 'Ignored: No video or document found' });
    }

    await connectDB();

    const fileId = videoObj.file_id;
    const fileSize = videoObj.file_size || 0;
    const duration = videoObj.duration || 0;
    const caption = message.caption || '';

    // Parse caption for title, hashtags (#viral, #premium), and GDrive thumbnail
    const { title, tags, thumbnailUrl, isPremium } = parseCaption(caption);

    // Fetch official file_path from Telegram Bot API
    const filePath = await getTelegramFilePath(fileId);

    // Save or update in MongoDB
    const video = await Video.findOneAndUpdate(
      { telegramFileId: fileId },
      {
        title,
        caption,
        telegramFileId: fileId,
        telegramFilePath: filePath,
        fileSize,
        duration,
        thumbnailUrl,
        tags,
        isPremium,
      },
      { upsert: true, new: true }
    );

    console.log(`✅ Saved Video to MongoDB: ${video.title} (Tags: ${tags.join(', ')})`);

    return res.status(200).json({
      success: true,
      message: 'Video indexed successfully',
      video: {
        id: video._id,
        title: video.title,
        tags: video.tags,
        isPremium: video.isPremium,
      },
    });
  } catch (error) {
    console.error('❌ Error handling telegram webhook:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
