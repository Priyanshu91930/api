import os
import re
import asyncio
from telethon import TelegramClient, events
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

# Credentials from .env
API_ID = int(os.getenv("TELEGRAM_API_ID", "27686895"))
API_HASH = os.getenv("TELEGRAM_API_HASH", "0e996bd3891969ec5dfebf8bb3e39e94")
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "8828626126:AAE1AHvZQg-48pQg5lM1KWrQ6meyMyk3WX4")
MONGODB_URI = os.getenv("MONGODB_URI")
TARGET_CHANNEL = os.getenv("TELEGRAM_CHANNEL_ID", "https://t.me/+PuWfxzC2QEVkNzA1")

# Connect to MongoDB
mongo = MongoClient(MONGODB_URI)
db = mongo.get_default_database()
videos_col = db["videos"]

# Client session
client = TelegramClient('linkwala_worker_session', API_ID, API_HASH)

def extract_bot_link(text):
    """
    Finds links like: https://t.me/Basic_need1_Rbot?start=BQADAQADzwoAAsQ14EaVCEFljzDqNRYE
    Returns (bot_username, start_param)
    """
    pattern = r"https?:\/\/t\.me\/([a-zA-Z0-9_]+)\?start=([a-zA-Z0-9_\-]+)"
    match = re.search(pattern, text)
    if match:
        return match.group(1), match.group(2)
    return None, None

@client.on(events.NewMessage(pattern=r"(?i).*(https?:\/\/t\.me\/.*)"))
async def handle_post_with_link(event):
    message_text = event.message.message or ""
    bot_username, start_param = extract_bot_link(message_text)

    if not bot_username or not start_param:
        return

    print(f"🔍 Found Link for Bot: @{bot_username} with start payload: {start_param}")
    status_msg = await event.reply(f"⏳ Connecting to @{bot_username} to retrieve file...")

    try:
        # Step 1: Send /start payload to the target bot
        async with client.conversation(f"@{bot_username}", timeout=45) as conv:
            await conv.send_message(f"/start {start_param}")
            response = await conv.get_response()

            # Wait for file message if the bot sends a processing text first
            video_msg = response
            if not (video_msg.video or video_msg.document):
                video_msg = await conv.get_response()

            if not (video_msg.video or video_msg.document):
                await status_msg.edit(f"❌ Could not retrieve video from @{bot_username}")
                return

            print("📥 Video received from bot! Forwarding to our storage channel...")
            
            # Step 2: Forward/Send video to our target channel
            forwarded = await client.send_message(TARGET_CHANNEL, video_msg)

            # Step 3: Extract file metadata
            media = video_msg.video or video_msg.document
            file_name = getattr(media, 'file_name', None) or video_msg.message or f"Video_{video_msg.id}"
            
            # Step 4: Extract images from current post if available
            thumbnail_url = ""
            if event.message.photo:
                # Save preview photo
                photo_path = await event.message.download_media(file="temp_thumb.jpg")
                print(f"🖼️ Thumbnail saved at: {photo_path}")

            # Step 5: Save directly to MongoDB Atlas
            video_doc = {
                "title": file_name,
                "caption": message_text,
                "telegramMessageId": forwarded.id,
                "sourceBot": bot_username,
                "tags": ["viral", "premium"],
                "isPremium": True,
                "fileSize": media.size if hasattr(media, 'size') else 0,
                "createdAt": asyncio.get_event_loop().time()
            }
            
            result = videos_col.insert_one(video_doc)
            print(f"✅ Saved to MongoDB with ID: {result.inserted_id}")

            await status_msg.edit(
                f"✅ <b>File Saved Successfully!</b>\n\n"
                f"🎬 <b>Title:</b> {file_name}\n"
                f"🤖 <b>From:</b> @{bot_username}\n"
                f"💎 <b>Database ID:</b> <code>{result.inserted_id}</code>",
                parse_mode="html"
            )

    except Exception as e:
        print(f"❌ Error during bot processing: {e}")
        await status_msg.edit(f"⚠️ Error: {str(e)}")

async def main():
    print("🚀 LinkWala Telegram Link Grabber Worker Starting...")
    await client.start()
    print("✅ Worker logged in and actively listening for posts with bot links!")
    await client.run_until_disconnected()

if __name__ == '__main__':
    asyncio.run(main())
