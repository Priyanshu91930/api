/**
 * Smart Universal Video Stream Redirect Handler for LinkWala
 * Opens LinkWala app directly to stream the video!
 */
export default function handler(req, res) {
  const { url = '', title = 'Shared Video' } = req.query;

  if (!url) {
    return res.status(400).send('Missing "url" query parameter');
  }

  const encodedUrl = encodeURIComponent(url.trim());
  const encodedTitle = encodeURIComponent((title || 'Shared Video').trim());

  // Direct Scheme URL
  const appSchemeUrl = `linkwala://watch?url=${encodedUrl}&title=${encodedTitle}`;

  // Standard Android Chrome Intent format
  const intentUrl = `intent://watch?url=${encodedUrl}&title=${encodedTitle}#Intent;scheme=linkwala;package=com.linkwala.official;end`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - LinkWala Stream</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #ffffff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      text-align: center;
    }
    .card {
      background: #1e293b;
      padding: 28px;
      border-radius: 20px;
      max-width: 420px;
      width: 100%;
      border: 1px solid #334155;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .badge {
      display: inline-block;
      background: #fee2e2;
      color: #e60023;
      padding: 6px 14px;
      border-radius: 20px;
      font-weight: 700;
      font-size: 13px;
      margin-bottom: 14px;
    }
    h1 {
      font-size: 20px;
      margin: 0 0 10px 0;
      color: #f8fafc;
      line-height: 1.4;
    }
    p {
      color: #94a3b8;
      font-size: 14px;
      margin: 0 0 20px 0;
    }
    .btn {
      display: block;
      width: 100%;
      background: #e60023;
      color: white;
      text-decoration: none;
      padding: 16px 0;
      border-radius: 14px;
      font-weight: 800;
      font-size: 16px;
      box-shadow: 0 4px 14px rgba(230, 0, 35, 0.4);
      margin-bottom: 12px;
    }
    .btn:active {
      transform: scale(0.98);
    }
    .sub-btn {
      display: block;
      width: 100%;
      background: rgba(255, 255, 255, 0.08);
      color: #cbd5e1;
      text-decoration: none;
      padding: 12px 0;
      border-radius: 12px;
      font-weight: 600;
      font-size: 14px;
      border: 1px solid rgba(255, 255, 255, 0.12);
    }
    .video-preview {
      width: 100%;
      border-radius: 12px;
      background: #000;
      margin-bottom: 16px;
      max-height: 220px;
    }
  </style>
  <script>
    function triggerApp() {
      // Try Intent first (Chrome on Android)
      window.location.href = "${intentUrl}";
      
      // Fallback to direct scheme
      setTimeout(function() {
        window.location.href = "${appSchemeUrl}";
      }, 500);
    }

    // Auto-launch on page load
    window.onload = function() {
      setTimeout(triggerApp, 300);
    };
  </script>
</head>
<body>
  <div class="card">
    <div class="badge">🎬 LinkWala Stream</div>
    <h1>${title}</h1>
    <p>Opening LinkWala App to stream video in HD with high-speed playback...</p>

    <video class="video-preview" controls playsinline src="${url}" preload="metadata">
      Your browser does not support HTML5 video.
    </video>

    <a href="${intentUrl}" onclick="triggerApp(); return false;" class="btn">
      ▶ Open in LinkWala App
    </a>

    <a href="https://play.google.com/store/apps/details?id=com.linkwala.official" class="sub-btn">
      Get LinkWala on Play Store
    </a>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
}

