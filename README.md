# Serverless Backend & Telegram Video Automation 🚀

Yeh folder zero-cost backend aur streaming architecture provide karta hai.

---

## 📁 File Structure

- **`config/db.js`**: Vercel Serverless optimized MongoDB Connection Pool.
- **`models/Video.js`**: Video collection (title, tags, telegram file_path, GDrive thumbnail, etc.).
- **`models/User.js`**: User verification and unlocked categories.
- **`telegram-webhook.js`**: Webhook endpoint jo Telegram bot/channel se forwarded videos automatically MongoDB me index karta hai.
- **`verify-channel.js`**: App ke liye channel join link provide aur verify karta hai.
- **`videos.js`**: Android app ke liye feed API (`?tag=viral`, `?tag=premium`, `?page=1`).
- **`cloudflare-worker.js`**: Cloudflare Worker script jo Telegram se video stream karke 7 din ke liye cache karta hai (Zero cost, Zero flood wait).

---

## ⚡ Setup Steps

### 1. Telegram Bot Banayein
1. Telegram me `@BotFather` open karein aur `/newbot` banayein.
2. Bot Token copy karein.
3. Bot ko apne Private Channel me **Admin** banayein.

### 2. Telegram Webhook Set Karein (Vercel Deploy ke baad)
Browser me yeh URL open karein:
```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-vercel-domain.vercel.app/api/bot/telegram-webhook
```

### 3. Video Upload / Forward Karne Ka Tarika:
Apne Telegram bot ya channel me video bhejte waqt caption me tags aur Google Drive thumbnail likh sakte hain:
```
My Awesome Reel #viral #trending [gdrive:YOUR_GDRIVE_FILE_ID]
```
- Bot automatically:
  1. Title extract karega.
  2. Tags add karega (`viral`, `trending`).
  3. GDrive thumbnail URL convert karega (`https://lh3.googleusercontent.com/d/YOUR_ID`).
  4. MongoDB Atlas me save kar dega!

### 4. Cloudflare Worker Deploy Karein
1. [Cloudflare Dashboard](https://dash.cloudflare.com/) me jayein -> **Workers & Pages** -> **Create Worker**.
2. `cloudflare-worker.js` ka code paste karein.
3. **Settings -> Variables** me jayein aur `TELEGRAM_BOT_TOKEN` set karein.
4. Save & Deploy karein. Copy kiya hua worker URL Vercel ke `.env` me `CLOUDFLARE_STREAM_URL` me daalein.
