import mongoose from 'mongoose';

const analyticsSchema = new mongoose.Schema({
  repoUrl: {
    type: String,
    required: true,
  },
  repoName: {
    type: String,
    required: true,
  },
  filesReviewedCount: {
    type: Number,
    required: true,
  },
  totalBugs: {
    type: Number,
    default: 0,
  },
  totalSecurityIssues: {
    type: Number,
    default: 0,
  },
  totalOptimizations: {
    type: Number,
    default: 0,
  },
  totalStylingIssues: {
    type: Number,
    default: 0,
  },
  totalFindings: {
    type: Number,
    default: 0,
  },
  healthScore: {
    type: Number,
    default: 100,
  },
  language: {
    type: String,
    default: 'General',
  },
  model: {
    type: String,
    default: 'llama-3.3-70b-versatile',
  },
  analyzedAt: {
    type: Date,
    default: Date.now,
  },
});

analyticsSchema.index({ analyzedAt: -1 });
analyticsSchema.index({ repoName: 1, analyzedAt: -1 });

export default mongoose.model('Analytics', analyticsSchema);
