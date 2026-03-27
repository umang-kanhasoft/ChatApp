import mongoose from 'mongoose';

const callLogSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    caller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    callee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['voice', 'video'], default: 'voice', required: true },
    status: {
      type: String,
      enum: ['ringing', 'ongoing', 'declined', 'missed', 'completed', 'failed'],
      default: 'ringing',
      index: true,
    },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    duration: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

callLogSchema.index({ caller: 1, createdAt: -1 });
callLogSchema.index({ callee: 1, createdAt: -1 });

export const CallLog = mongoose.model('CallLog', callLogSchema);
