/**
 * Cloudflare Worker for High-Speed Telegram Video Streaming & Image CDN
 * 
 * Features:
 * - /stream?path=videos/... -> High-speed Range video streaming with Edge Cache
 * - /image?path=photos/...  -> Instant photo CDN with 30-day Edge Cache
 * 
 * Environment Variable in Cloudflare Worker settings:
 * - TELEGRAM_BOT_TOKEN: Your Bot Token from @BotFather
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Support both /stream and /image endpoints
    if (url.pathname !== '/stream' && url.pathname !== '/image') {
      return new Response('Endpoints available: /stream?path=... or /image?path=...', { status: 404 });
    }

    const filePath = url.searchParams.get('path');
    if (!filePath) {
      return new Response('Missing "path" query parameter', { status: 400 });
    }

    const botToken = env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return new Response('Server configuration error: TELEGRAM_BOT_TOKEN is missing', { status: 500 });
    }

    // Direct Telegram file download CDN URL
    const telegramFileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

    const isImage = url.pathname === '/image';
    const rangeHeader = request.headers.get('Range');
    const headers = new Headers();
    if (rangeHeader) {
      headers.set('Range', rangeHeader);
    }

    // Attempt to match from Cloudflare Global Edge Cache
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), {
      headers: request.headers,
      method: 'GET',
    });

    let response;
    // For images or non-range video requests, check cache
    if (!rangeHeader) {
      response = await cache.match(cacheKey);
    }

    if (!response) {
      // Fetch from Telegram CDN
      const tgResponse = await fetch(telegramFileUrl, { headers });

      const newHeaders = new Headers(tgResponse.headers);
      newHeaders.set('Access-Control-Allow-Origin', '*');
      newHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      newHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

      if (isImage) {
        // Cache images on Cloudflare Edge for 30 days
        newHeaders.set('Cache-Control', 'public, max-age=2592000, s-maxage=2592000');
        newHeaders.set('Content-Type', tgResponse.headers.get('Content-Type') || 'image/jpeg');
      } else {
        // Cache videos for 7 days
        newHeaders.set('Cache-Control', 'public, max-age=604800, s-maxage=604800');
      }

      response = new Response(tgResponse.body, {
        status: tgResponse.status,
        statusText: tgResponse.statusText,
        headers: newHeaders,
      });

      // Put into Cloudflare Edge Cache
      if (tgResponse.status === 200 && !rangeHeader) {
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
      }
    }

    return response;
  },
};
