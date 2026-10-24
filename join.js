/**
 * Smart Universal Redirect Handler
 * Opens LinkWala app directly with code, or redirects to Google Play Store!
 * 
 * Usage URL:
 * https://api-brainaxe.vercel.app/join?code=VIRAL
 */
export default function handler(req, res) {
  const { code = 'VIRAL' } = req.query;
  const normalizedCode = encodeURIComponent(code.trim().toUpperCase());

  const appSchemeUrl = `linkwala://join?code=${normalizedCode}`;
  const playStoreUrl = `https://play.google.com/store/apps/details?id=com.linkwala.official&referrer=code%3D${normalizedCode}`;
  
  // Chrome Android Intent format: Launches app immediately if installed
  const intentUrl = `intent://join?code=${normalizedCode}#Intent;scheme=linkwala;package=com.linkwala.official;S.browser_fallback_url=${encodeURIComponent(playStoreUrl)};end`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Opening LinkWala...</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #ffffff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 20px;
      text-align: center;
      box-sizing: border-box;
    }
    .card {
      background: #1e293b;
      padding: 30px;
      border-radius: 20px;
      max-width: 360px;
      width: 100%;
      border: 1px solid #334155;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .btn {
      display: inline-block;
      width: 100%;
      background: #e60023;
      color: white;
      text-decoration: none;
      padding: 14px 0;
      border-radius: 12px;
      font-weight: 700;
      font-size: 16px;
      margin-top: 20px;
      box-sizing: border-box;
    }
    .code-badge {
      background: #334155;
      padding: 6px 14px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 18px;
      font-weight: bold;
      color: #38bdf8;
      display: inline-block;
      margin-top: 10px;
    }
  </style>
  <script>
    // Automatically launch Android App immediately
    window.location.replace("${intentUrl}");
  </script>
</head>
<body>
  <div class="card">
    <h2>🚀 Opening LinkWala...</h2>
    <p>Unlocking channel with code:</p>
    <div class="code-badge">${code.toUpperCase()}</div>
    <br/>
    <a href="${intentUrl}" class="btn">Open App</a>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
}
