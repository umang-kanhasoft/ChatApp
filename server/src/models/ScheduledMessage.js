import mongoose from 'mongoose';

const scheduledMessageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    clientMessageId: {
      type: String,
      required: true,
      index: true,
    },
    payload: {
      text: { type: String, required: true, maxlength: 5000 },
      replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null,
      },
    },
    recurrence: {
      frequency: {
        type: String,
        enum: ['none', 'daily', 'weekly'],
        default: 'none',
      },
      interval: {
        type: Number,
        min: 1,
        max: 30,
        default: 1,
      },
    },
    runAt: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'sent', 'failed', 'canceled'],
      default: 'pending',
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    lockedAt: {
      type: Date,
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    canceledAt: {
      type: Date,
      default: null,
    },
    sentMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    lastError: {
      type: String,
      default: '',
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  },
);

scheduledMessageSchema.index({ status: 1, runAt: 1 });
scheduledMessageSchema.index({ conversation: 1, sender: 1, runAt: -1 });
scheduledMessageSchema.index({ conversation: 1, sender: 1, clientMessageId: 1 }, { unique: true });

export const ScheduledMessage = mongoose.model('ScheduledMessage', scheduledMessageSchema);
