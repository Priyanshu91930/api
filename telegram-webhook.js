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
 * Parse post link e.g. https://t.me/c/4315694064/3
 * Returns { chatId: "-1004315694064", messageId: 3 }
 */
function parseTelegramPostLink(link) {
  // Pattern 1: Private channel post link https://t.me/c/4315694064/3
  const privateMatch = link.match(/t\.me\/c\/(\d+)\/(\d+)/i);
  if (privateMatch) {
    return {
      chatId: `-100${privateMatch[1]}`,
      messageId: parseInt(privateMatch[2], 10),
    };
  }

  // Pattern 2: Public channel post link https://t.me/mychannel/123
  const publicMatch = link.match(/t\.me\/([a-zA-Z0-9_]+)\/(\d+)/i);
  if (publicMatch) {
    return {
      chatId: `@${publicMatch[1]}`,
      messageId: parseInt(publicMatch[2], 10),
    };
  }

  return null;
}

/**
 * Fetch video file from dump channel message by forwarding it to bot's chat
 */
async function resolveVideoFromPostLink(postLink, botChatId) {
  const parsed = parseTelegramPostLink(postLink);
  if (!parsed) return null;

  try {
    // Copy/Forward the original message from the dump channel to inspect its video file
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/copyMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: botChatId,
        from_chat_id: parsed.chatId,
        message_id: parsed.messageId,
      }),
    });

    const data = await res.json();
    if (!data.ok || !data.result) {
      console.warn('copyMessage failed, trying forwardMessage:', data.description);
      const fwdUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/forwardMessage`;
      const fwdRes = await fetch(fwdUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: botChatId,
          from_chat_id: parsed.chatId,
          message_id: parsed.messageId,
        }),
      });
      const fwdData = await fwdRes.json();
      if (fwdData.ok && fwdData.result) {
        const msg = fwdData.result;
        return msg.video || msg.document;
      }
      return null;
    }

    return null;
  } catch (err) {
    console.error('Failed to resolve video from post link:', err);
    return null;
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
          `• Dump Channel me photo + caption me dump video link post karein\n` +
          `• Main dump post se direct video uthakar Cloudflare streaming link bana dunga!\n\n` +
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

    // 1. DUMP CHANNEL POST HANDLER: Photo posted with Telegram Post Link in caption
    if (photoArr && photoArr.length > 0) {
      const bestPhoto = photoArr[photoArr.length - 1];
      const caption = message.caption || '';

      // Instant Cloudflare CDN Image URL
      const imageCdnUrl = await getPhotoCdnUrl(bestPhoto.file_id);

      // Extract Telegram Post Link from caption
      const tgLinkMatch = caption.match(/(https?:\/\/t\.me\/[^\s]+)/i);

      if (tgLinkMatch) {
        await connectDB();
        const { title, tags, isPremium } = parseCaption(caption);
        const targetLink = tgLinkMatch[1];

        let videoFilePath = '';
        let videoFileId = bestPhoto.file_id;
        let duration = 0;
        let fileSize = 0;

        // Try to fetch original video file from the dump channel post
        const parsedLink = parseTelegramPostLink(targetLink);
        if (parsedLink) {
          try {
            // Forward message to inspect original video
            const fwdRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/forwardMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                from_chat_id: parsedLink.chatId,
                message_id: parsedLink.messageId,
              }),
            });
            const fwdData = await fwdRes.json();
            if (fwdData.ok && fwdData.result) {
              const fwdVideo = fwdData.result.video || fwdData.result.document;
              if (fwdVideo) {
                videoFileId = fwdVideo.file_id;
                fileSize = fwdVideo.file_size || 0;
                duration = fwdVideo.duration || 0;
                videoFilePath = await getTelegramFilePath(fwdVideo.file_id);

                // Delete the temporary forwarded message to keep channel clean
                await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: chatId,
                    message_id: fwdData.result.message_id,
                  }),
                }).catch(() => {});
              }
            }
          } catch (e) {
            console.error('Error fetching video from dump post link:', e.message);
          }
        }

        // Cloudflare stream link
        const streamUrl = videoFilePath
          ? `${CLOUDFLARE_STREAM_URL}/stream?path=${encodeURIComponent(videoFilePath)}`
          : targetLink;

        // Save into MongoDB Atlas
        const video = await Video.findOneAndUpdate(
          { caption: targetLink },
          {
            title: title || `Video_${Date.now()}`,
            caption,
            telegramFileId: videoFileId,
            telegramFilePath: videoFilePath || targetLink,
            thumbnailUrl: imageCdnUrl,
            tags,
            duration,
            fileSize,
            isPremium,
          },
          { upsert: true, new: true }
        );

        await sendTelegramMessage(
          chatId,
          `✅ <b>Video Post Synced to LinkWala App!</b> 🎉\n\n` +
            `🎬 <b>Title:</b> ${video.title}\n` +
            `🏷️ <b>Tags:</b> ${tags.map((t) => '#' + t).join(' ')}\n` +
            `🖼️ <b>Thumbnail CDN:</b>\n<code>${imageCdnUrl}</code>\n\n` +
            (videoFilePath
              ? `⚡ <b>Cloudflare Stream Link:</b>\n<code>${streamUrl}</code>`
              : `🔗 <b>Dump Post Link:</b>\n<code>${targetLink}</code>`),
          { reply_to_message_id: message.message_id }
        );
        return res.status(200).json({ success: true, message: 'Dump post indexed with video', id: video._id });
      }

      // If only photo sent
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

      const streamUrl = `${CLOUDFLARE_STREAM_URL}/stream?path=${encodeURIComponent(filePath)}`;

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

    return res.status(200).json({ status: 'No action' });
  } catch (error) {
    console.error('❌ Error handling telegram webhook:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
