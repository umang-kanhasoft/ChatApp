import mongoose from 'mongoose';

const statusReactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const statusViewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const statusSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['text', 'image', 'video'], default: 'text', required: true },
    text: { type: String, default: '', maxlength: 1000 },
    mediaUrl: { type: String, default: '' },
    caption: { type: String, default: '', maxlength: 500 },
    privacy: { type: String, enum: ['all', 'contacts', 'private'], default: 'all' },
    allowedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    viewedBy: { type: [statusViewSchema], default: [] },
    reactions: { type: [statusReactionSchema], default: [] },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  },
  {
    timestamps: true,
  },
);

statusSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
statusSchema.index({ user: 1, createdAt: -1 });

export const Status = mongoose.model('Status', statusSchema);
