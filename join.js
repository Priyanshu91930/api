/**
 * Smart Universal Redirect Handler
 * Opens LinkWala app directly with code!
 */
export default function handler(req, res) {
  const { code = 'VIRAL' } = req.query;
  const normalizedCode = encodeURIComponent(code.trim().toUpperCase());

  // Direct Scheme URL
  const appSchemeUrl = `linkwala://join?code=${normalizedCode}`;
  
  // Standard Android Chrome Intent format
  const intentUrl = `intent://join?code=${normalizedCode}#Intent;scheme=linkwala;package=com.linkwala.official;end`;

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
      padding: 16px 0;
      border-radius: 14px;
      font-weight: 800;
      font-size: 17px;
      margin-top: 24px;
      box-sizing: border-box;
      box-shadow: 0 4px 14px rgba(230, 0, 35, 0.4);
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
    function triggerApp() {
      // Try Intent first (Chrome on Android)
      window.location.href = "${intentUrl}";
      
      // Fallback to direct scheme
      setTimeout(function() {
        window.location.href = "${appSchemeUrl}";
      }, 500);
    }
    window.onload = triggerApp;
  </script>
</head>
<body>
  <div class="card">
    <h2>🚀 Launching LinkWala...</h2>
    <p>Unlocking channel with code:</p>
    <div class="code-badge">${code.toUpperCase()}</div>
    <br/>
    <a href="${intentUrl}" class="btn" onclick="triggerApp()">Tap to Open LinkWala</a>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
}
