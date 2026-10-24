/**
 * Cloudflare Worker for High-Speed Telegram Video Streaming & Global Edge Caching
 * 
 * Deploy this on Cloudflare Workers (Free Plan: 100k requests/day)
 * Environment Variable required in Cloudflare Worker settings:
 * - TELEGRAM_BOT_TOKEN: Your Bot Token from @BotFather
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Only allow /stream path
    if (url.pathname !== '/stream') {
      return new Response('Stream endpoint is /stream?path=videos/...', { status: 404 });
    }

    const filePath = url.searchParams.get('path');
    if (!filePath) {
      return new Response('Missing "path" query parameter', { status: 400 });
    }

    // Telegram Bot Token from Cloudflare Worker Environment Variable
    const botToken = env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return new Response('Server configuration error: TELEGRAM_BOT_TOKEN is missing', { status: 500 });
    }

    // Direct Telegram file download CDN URL
    const telegramFileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

    // Pass along Range header from Android video player for seeking support
    const rangeHeader = request.headers.get('Range');
    const headers = new Headers();
    if (rangeHeader) {
      headers.set('Range', rangeHeader);
    }

    // Attempt to match from Cloudflare Edge Cache
    const cache = caches.default;
    // Create cache key without query parameters or with canonical URL
    const cacheKey = new Request(url.toString(), {
      headers: request.headers,
      method: 'GET',
    });

    let response;
    // If not seeking with Range, check cache
    if (!rangeHeader) {
      response = await cache.match(cacheKey);
    }

    if (!response) {
      // Fetch from Telegram CDN
      const tgResponse = await fetch(telegramFileUrl, {
        headers,
      });

      // Clone response and attach caching headers
      const newHeaders = new Headers(tgResponse.headers);
      newHeaders.set('Access-Control-Allow-Origin', '*');
      newHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      newHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
      
      // Cache publicly for 7 days on Cloudflare Edge CDN (so Telegram is hit only once!)
      newHeaders.set('Cache-Control', 'public, max-age=604800, s-maxage=604800');

      response = new Response(tgResponse.body, {
        status: tgResponse.status,
        statusText: tgResponse.statusText,
        headers: newHeaders,
      });

      // Save to Cloudflare Edge Cache if response is 200 OK (full file fetch)
      if (tgResponse.status === 200 && !rangeHeader) {
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
      }
    }

    return response;
  },
};
