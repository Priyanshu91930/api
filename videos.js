import { connectDB } from './config/db.js';
import Video from './models/Video.js';
import User from './models/User.js';

const CLOUDFLARE_STREAM_URL = process.env.CLOUDFLARE_STREAM_URL; // e.g. https://stream.yourname.workers.dev

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    await connectDB();

    const { tag, deviceId, page = 1, limit = 20 } = req.query;

    const query = {};
    if (tag && tag !== 'all') {
      query.tags = tag.toLowerCase();
    }

    // Check user permissions if accessing premium tag
    let isUserVerified = false;
    if (deviceId) {
      const user = await User.findOne({ deviceId });
      if (user && user.isTelegramJoined) {
        isUserVerified = true;
      }
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const videos = await Video.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await Video.countDocuments(query);

    // Build video response with Cloudflare stream links
    const formattedVideos = videos.map((v) => {
      // If video is premium and user is not verified, lock the stream link
      const isLocked = v.isPremium && !isUserVerified;

      // Cloudflare worker stream URL proxying telegram path
      const streamUrl = isLocked
        ? null
        : `${CLOUDFLARE_STREAM_URL}/stream?path=${encodeURIComponent(v.telegramFilePath)}`;

      return {
        id: v._id,
        title: v.title,
        caption: v.caption,
        thumbnailUrl: v.thumbnailUrl,
        tags: v.tags,
        isPremium: v.isPremium,
        isLocked,
        duration: v.duration,
        fileSize: v.fileSize,
        streamUrl,
        viewsCount: v.viewsCount,
        createdAt: v.createdAt,
      };
    });

    // Get all unique tags present in database
    const availableTags = await Video.distinct('tags');
    const validTags = (availableTags || []).filter(Boolean);

    return res.status(200).json({
      success: true,
      tags: validTags,
      data: formattedVideos,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('❌ Error fetching videos:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
