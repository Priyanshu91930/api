import { connectDB } from './config/db.js';
import User from './models/User.js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID; // e.g. -100123456789 or @yourchannel

export default async function handler(req, res) {
  // Allow CORS for React Native / mobile clients
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    // Return the public channel link so app can open it
    const publicLink = process.env.TELEGRAM_CHANNEL_INVITE_LINK || 'https://t.me/your_channel';
    return res.status(200).json({
      success: true,
      channelUrl: publicLink,
    });
  }

  if (req.method === 'POST') {
    const { deviceId, telegramUserId, code } = req.body;

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId is required' });
    }

    try {
      await connectDB();

      const normalizedCode = (code || '').trim().toUpperCase();
      const VALID_CODES = ['LINKWALA', 'VIRAL', 'PREMIUM', 'TG2026'];

      // Check if submitted code is valid
      const isCodeValid = VALID_CODES.includes(normalizedCode);

      let isJoined = false;

      // If telegramUserId is provided, check with Telegram Bot API
      if (telegramUserId && TELEGRAM_BOT_TOKEN && TELEGRAM_CHANNEL_ID) {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(
          TELEGRAM_CHANNEL_ID
        )}&user_id=${telegramUserId}`;

        const tgResponse = await fetch(url);
        const tgData = await tgResponse.json();

        if (tgData.ok && tgData.result) {
          const status = tgData.result.status;
          isJoined = ['member', 'administrator', 'creator'].includes(status);
        }
      } else {
        isJoined = isCodeValid;
      }

      if (!isJoined && !isCodeValid) {
        return res.status(400).json({
          success: false,
          error: 'Invalid Code! Please join our Telegram channel to receive the code.',
        });
      }

      // Update user record in MongoDB
      const user = await User.findOneAndUpdate(
        { deviceId },
        {
          deviceId,
          telegramUserId: telegramUserId || null,
          isTelegramJoined: isJoined,
          verifiedAt: isJoined ? new Date() : null,
          unlockedTags: isJoined ? ['viral', 'premium', 'trending'] : ['viral'],
        },
        { upsert: true, new: true }
      );

      return res.status(200).json({
        success: true,
        isTelegramJoined: user.isTelegramJoined,
        unlockedTags: user.unlockedTags,
        message: user.isTelegramJoined ? 'Channel verified successfully' : 'Not yet joined',
      });
    } catch (error) {
      console.error('❌ Verification error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
