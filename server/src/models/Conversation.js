import mongoose from 'mongoose';

const participantSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member'],
      default: 'member',
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    unreadCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastReadMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    isMuted: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false },
);

const conversationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['private', 'group', 'channel'],
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: '',
      trim: true,
    },
    avatar: {
      type: String,
      default: '',
    },
    privateKey: {
      type: String,
      default: '',
    },
    participants: {
      type: [participantSchema],
      validate: {
        validator: (value) => value.length >= 2,
        message: 'Conversation requires at least two participants',
      },
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    pinnedMessageIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
      },
    ],
    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

conversationSchema.index({ 'participants.user': 1, lastActivityAt: -1 });
conversationSchema.index({ type: 1, updatedAt: -1 });
conversationSchema.index(
  { privateKey: 1 },
  { unique: true, partialFilterExpression: { type: 'private', privateKey: { $type: 'string', $ne: '' } } },
);

export const Conversation = mongoose.model('Conversation', conversationSchema);
