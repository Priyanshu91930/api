import { connectDB } from './config/db.js';
import Video from './models/Video.js';

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
          `Main aapki videos ko app me high-speed stream aur auto-index karta hoon.\n\n` +
          `<b>Commands:</b>\n` +
          `• Send/Forward any Video or File\n` +
          `• <code>/stats</code> - Check total database videos\n` +
          `• <code>/help</code> - How to use\n\n` +
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

    if (text.startsWith('/help')) {
      await sendTelegramMessage(
        chatId,
        `ℹ️ <b>How to Index Videos in LinkWala App:</b>\n\n` +
          `1. Mujhe ya aapke connected channel me koi bhi <b>Video</b> send/forward karein.\n` +
          `2. Caption me Title aur Tags likhein:\n` +
          `   <i>My Viral Video #viral #premium [gdrive:YOUR_IMAGE_ID]</i>\n` +
          `3. Video turant MongoDB me index ho jayegi aur app me live ho jayegi!`
      );
      return res.status(200).json({ status: 'Handled /help' });
    }

    if (text.startsWith('/stats')) {
      await connectDB();
      const count = await Video.countDocuments();
      await sendTelegramMessage(
        chatId,
        `📊 <b>LinkWala Database Stats:</b>\n\n` +
          `• Total Indexed Videos: <b>${count}</b>\n` +
          `• Cloudflare Edge Cache: <b>Active</b>\n` +
          `• Serverless Status: <b>Online</b>`
      );
      return res.status(200).json({ status: 'Handled /stats' });
    }

    // Video / Document processing
    const videoObj = message.video || message.document;
    if (!videoObj) {
      // Normal text received but not a command
      if (text) {
        await sendTelegramMessage(
          chatId,
          `📹 Mujhe video forward karein ya send karein taaki wo LinkWala app me automatically add ho sake!\n\nHelp ke liye <code>/help</code> bhejein.`
        );
      }
      return res.status(200).json({ status: 'Handled text' });
    }

    await connectDB();

    const fileId = videoObj.file_id;
    const fileSize = videoObj.file_size || 0;
    const duration = videoObj.duration || 0;
    const caption = message.caption || '';

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

    // Stream URL via Cloudflare Worker
    const streamUrl = `${CLOUDFLARE_STREAM_URL}/stream?path=${encodeURIComponent(filePath)}`;

    // Send instant confirmation reply to Telegram
    await sendTelegramMessage(
      chatId,
      `✅ <b>Video Saved Successfully to LinkWala!</b> 🎉\n\n` +
        `🎬 <b>Title:</b> ${video.title}\n` +
        `🏷️ <b>Tags:</b> ${tags.map((t) => '#' + t).join(' ')}\n` +
        `💎 <b>Type:</b> ${isPremium ? 'Premium (Locked)' : 'Public'}\n` +
        `📦 <b>Size:</b> ${(fileSize / (1024 * 1024)).toFixed(1)} MB\n\n` +
        `⚡ <b>Cloudflare Stream Link:</b>\n<code>${streamUrl}</code>`,
      {
        reply_to_message_id: message.message_id,
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Video indexed and replied successfully',
      video: {
        id: video._id,
        title: video.title,
      },
    });
  } catch (error) {
    console.error('❌ Error handling telegram webhook:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
