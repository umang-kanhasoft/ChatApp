import mongoose from 'mongoose';

const groupCallSessionSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['voice', 'video'],
      default: 'voice',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'ended'],
      default: 'active',
      index: true,
    },
    participants: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    endedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

groupCallSessionSchema.index({ conversation: 1, status: 1 });

export const GroupCallSession = mongoose.model('GroupCallSession', groupCallSessionSchema);
