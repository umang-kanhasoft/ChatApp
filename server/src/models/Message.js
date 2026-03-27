import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
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
      default: '',
      index: true,
    },
    type: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'document', 'poll', 'system'],
      default: 'text',
      required: true,
    },
    content: {
      text: { type: String, maxlength: 5000, default: '' },
      mediaUrl: { type: String, default: '' },
      fileName: { type: String, default: '' },
      mimeType: { type: String, default: '' },
      fileSize: { type: Number, default: 0 },
      poll: {
        question: { type: String, default: '' },
        allowMultipleChoice: { type: Boolean, default: false },
        expiresAt: { type: Date, default: null },
        options: [
          {
            text: { type: String, required: true },
            votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
          },
        ],
      },
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    deliveredTo: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        at: { type: Date, default: Date.now },
      },
    ],
    readBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        at: { type: Date, default: Date.now },
      },
    ],
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['sending', 'sent', 'delivered', 'read'],
      default: 'sent',
    },
    reactions: [
      {
        emoji: { type: String, required: true },
        users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      },
    ],
    isForwarded: {
      type: Boolean,
      default: false,
      index: true,
    },
    forwardedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    starredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    pinnedAt: {
      type: Date,
      default: null,
      index: true,
    },
    deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    deletedForEveryone: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ 'content.text': 'text' });
messageSchema.index(
  { conversation: 1, sender: 1, clientMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientMessageId: { $type: 'string', $ne: '' } },
  },
);

export const Message = mongoose.model('Message', messageSchema);
