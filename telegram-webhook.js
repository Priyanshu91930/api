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
 * Convert photo file_id directly to Cloudflare Image CDN link
 */
async function getPhotoCdnUrl(photoFileId) {
  try {
    const filePath = await getTelegramFilePath(photoFileId);
    return `${CLOUDFLARE_STREAM_URL}/image?path=${encodeURIComponent(filePath)}`;
  } catch (err) {
    console.error('Failed to get photo CDN URL:', err.message);
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

  // Clean title by removing hashtags and telegram links
  let cleanTitle = caption
    .replace(/#\w+/g, '')
    .replace(/https?:\/\/t\.me\/[^\s]+/gi, '')
    .trim();

  if (!cleanTitle) {
    cleanTitle = `Video_${Date.now()}`;
  }

  return {
    title: cleanTitle,
    tags: tags.length > 0 ? tags : ['viral'],
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
          `Main aapki videos aur photos ko Cloudflare Edge CDN se stream aur auto-index karta hoon!\n\n` +
          `<b>Kaise use karein:</b>\n` +
          `• Dump Channel me photo + caption me telegram video link post karein\n` +
          `• Photo Cloudflare Edge CDN par instant live ho jayegi\n` +
          `• Post seedha LinkWala App me render hone lagega!\n\n` +
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
          `• Total Indexed Posts: <b>${count}</b>\n` +
          `• Cloudflare Edge CDN: <b>Active (Videos + Images)</b>\n` +
          `• Serverless Status: <b>Online</b>`
      );
      return res.status(200).json({ status: 'Handled /stats' });
    }

    const videoObj = message.video || message.document;
    const photoArr = message.photo;

    // 1. DUMP CHANNEL POST HANDLER: Photo posted with Telegram link in caption
    if (photoArr && photoArr.length > 0) {
      const bestPhoto = photoArr[photoArr.length - 1];
      const caption = message.caption || '';

      // Instant Cloudflare CDN Image URL
      const imageCdnUrl = await getPhotoCdnUrl(bestPhoto.file_id);

      // Check if caption contains a Telegram video or bot link
      const tgLinkMatch = caption.match(/(https?:\/\/t\.me\/[^\s]+)/i);

      if (tgLinkMatch) {
        await connectDB();
        const { title, tags, isPremium } = parseCaption(caption);
        const targetLink = tgLinkMatch[1];

        // Save into MongoDB Atlas
        const video = await Video.findOneAndUpdate(
          { caption: targetLink },
          {
            title: title || `Post_${Date.now()}`,
            caption,
            telegramFileId: bestPhoto.file_id,
            telegramFilePath: targetLink,
            thumbnailUrl: imageCdnUrl,
            tags,
            isPremium,
          },
          { upsert: true, new: true }
        );

        await sendTelegramMessage(
          chatId,
          `✅ <b>Post Synced to LinkWala App!</b> 🎉\n\n` +
            `🎬 <b>Title:</b> ${video.title}\n` +
            `🏷️ <b>Tags:</b> ${tags.map((t) => '#' + t).join(' ')}\n` +
            `🖼️ <b>Cloudflare Image CDN:</b>\n<code>${imageCdnUrl}</code>\n\n` +
            `🔗 <b>Video Link:</b>\n<code>${targetLink}</code>`,
          { reply_to_message_id: message.message_id }
        );
        return res.status(200).json({ success: true, message: 'Dump post indexed', id: video._id });
      }

      // If only photo sent without caption link
      await sendTelegramMessage(
        chatId,
        `🖼️ <b>Cloudflare Image CDN Link:</b>\n\n<code>${imageCdnUrl}</code>`,
        { reply_to_message_id: message.message_id }
      );
      return res.status(200).json({ status: 'Photo CDN generated', url: imageCdnUrl });
    }

    // 2. DIRECT VIDEO FORWARD / UPLOAD HANDLER
    if (videoObj) {
      await connectDB();

      const fileId = videoObj.file_id;
      const fileSize = videoObj.file_size || 0;
      const duration = videoObj.duration || 0;
      const caption = message.caption || '';

      const { title, tags, isPremium } = parseCaption(caption);
      const filePath = await getTelegramFilePath(fileId);

      // Instant Cloudflare Video Streaming Link
      const streamUrl = `${CLOUDFLARE_STREAM_URL}/stream?path=${encodeURIComponent(filePath)}`;

      // Thumbnail from video if available
      let thumbCdn = '';
      if (videoObj.thumbnail?.file_id) {
        thumbCdn = await getPhotoCdnUrl(videoObj.thumbnail.file_id);
      }

      const video = await Video.findOneAndUpdate(
        { telegramFileId: fileId },
        {
          title,
          caption,
          telegramFileId: fileId,
          telegramFilePath: filePath,
          fileSize,
          duration,
          thumbnailUrl: thumbCdn,
          tags,
          isPremium,
        },
        { upsert: true, new: true }
      );

      await sendTelegramMessage(
        chatId,
        `✅ <b>Video Saved Successfully!</b> 🎉\n\n` +
          `🎬 <b>Title:</b> ${video.title}\n` +
          `🏷️ <b>Tags:</b> ${tags.map((t) => '#' + t).join(' ')}\n` +
          `📦 <b>Size:</b> ${(fileSize / (1024 * 1024)).toFixed(1)} MB\n` +
          (thumbCdn ? `🖼️ <b>Thumbnail:</b>\n<code>${thumbCdn}</code>\n\n` : '\n') +
          `⚡ <b>Cloudflare Stream Link:</b>\n<code>${streamUrl}</code>`,
        { reply_to_message_id: message.message_id }
      );

      return res.status(200).json({ success: true, id: video._id });
    }

    if (text) {
      await sendTelegramMessage(
        chatId,
        `📹 Mujhe photo + video link caption me bhejein ya direct video forward karein!\n\nHelp ke liye <code>/help</code> bhejein.`
      );
      return res.status(200).json({ status: 'Handled text' });
    }

    return res.status(200).json({ status: 'No action' });
  } catch (error) {
    console.error('❌ Error handling telegram webhook:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
