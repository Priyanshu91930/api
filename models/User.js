import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    telegramUserId: {
      type: String,
      default: null,
      index: true,
    },
    isTelegramJoined: {
      type: Boolean,
      default: false,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    unlockedTags: {
      type: [String],
      default: ['viral'],
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.User || mongoose.model('User', UserSchema);
