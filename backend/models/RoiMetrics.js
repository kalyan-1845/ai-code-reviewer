import mongoose from 'mongoose';

const roiMetricsSchema = new mongoose.Schema({
  clientId: {
    type: String,
    default: 'system',
    index: true,
  },
  repoName: {
    type: String,
    required: true,
    index: true,
  },
  totalPrsReviewed: {
    type: Number,
    default: 0,
  },
  totalAiComments: {
    type: Number,
    default: 0,
  },
  acceptedSuggestions: {
    type: Number,
    default: 0,
  },
  timeSavedMinutes: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

// Static method to upsert metrics for a repository
roiMetricsSchema.statics.recordPrReview = async function (clientId, repoName, commentsCount) {
  return await this.findOneAndUpdate(
    { clientId, repoName },
    {
      $inc: {
        totalPrsReviewed: 1,
        totalAiComments: commentsCount
      }
    },
    { new: true, upsert: true }
  );
};

roiMetricsSchema.statics.recordAcceptedSuggestion = async function (clientId, repoName) {
  // Assume each accepted suggestion saves ~15 minutes of developer time
  return await this.findOneAndUpdate(
    { clientId, repoName },
    {
      $inc: {
        acceptedSuggestions: 1,
        timeSavedMinutes: 15
      }
    },
    { new: true, upsert: true }
  );
};

export const RoiMetrics = mongoose.model('RoiMetrics', roiMetricsSchema);
