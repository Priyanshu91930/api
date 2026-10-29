/**
 * Secure Serverless Configuration Endpoint for LinkWala
 * Serves bot token and storage parameters dynamically from Vercel Environment Variables
 */
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({
      success: false,
      error: 'TELEGRAM_BOT_TOKEN is not configured in Vercel environment variables',
    });
  }

  return res.status(200).json({
    success: true,
    botToken: botToken,
    dumpChatId: process.env.TELEGRAM_DUMP_CHAT_ID || '-1004315694064',
    streamBaseUrl:
      process.env.CLOUDFLARE_STREAM_URL || 'https://linkwala.priyanshusolanki62.workers.dev',
  });
}

