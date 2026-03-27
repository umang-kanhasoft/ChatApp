import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetType: {
      type: String,
      enum: ['user', 'message', 'status', 'conversation'],
      required: true,
      index: true,
    },
    targetId: { type: String, required: true, index: true },
    reason: {
      type: String,
      enum: ['spam', 'abuse', 'harassment', 'hate', 'illegal', 'other'],
      default: 'other',
      required: true,
    },
    details: { type: String, default: '', maxlength: 2000 },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'actioned', 'dismissed'],
      default: 'pending',
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

reportSchema.index({ reporter: 1, targetType: 1, targetId: 1, createdAt: -1 });

export const Report = mongoose.model('Report', reportSchema);
