import mongoose from 'mongoose';

const VideoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    caption: {
      type: String,
      default: '',
    },
    telegramFileId: {
      type: String,
      required: true,
      index: true,
    },
    telegramFilePath: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    duration: {
      type: Number,
      default: 0,
    },
    thumbnailUrl: {
      type: String, // Google Drive image link or uploaded thumbnail
      default: '',
    },
    tags: {
      type: [String], // e.g. ["viral", "premium", "trending"]
      default: ['viral'],
      index: true,
    },
    isPremium: {
      type: Boolean,
      default: false,
      index: true,
    },
    viewsCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent model re-compilation error in Vercel hot reloads
export default mongoose.models.Video || mongoose.model('Video', VideoSchema);
