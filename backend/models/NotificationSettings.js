import mongoose from 'mongoose';

const notificationSettingsSchema = new mongoose.Schema({
  clientId: {
    type: String,
    required: true,
    index: true,
  },
  email: {
    type: String,
    default: '',
  },
  slackWebhookUrl: {
    type: String,
    default: '',
  },
  onReviewComplete: {
    type: Boolean,
    default: false,
  },
  onSecurityFinding: {
    type: Boolean,
    default: false,
  },
  onError: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

notificationSettingsSchema.index({ clientId: 1 }, { unique: true });

export default mongoose.model('NotificationSettings', notificationSettingsSchema);
