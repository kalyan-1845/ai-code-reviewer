import mongoose from 'mongoose';

const analyticsSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    index: true,
  },
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
  prSummary: {
  overallPurpose: {
    type: String,
    default: "",
  },
  filesChanged: {
    type: Number,
    default: 0,
  },
  majorLogicUpdates: {
    type: [String],
    default: [],
  },
  potentialRisks: {
    type: [String],
    default: [],
  },
  breakingChanges: {
    type: [String],
    default: [],
  },
  testingRecommendations: {
    type: [String],
    default: [],
  },
},
dependencyReport: {
  type: Array,
  default: [],
},
  repositoryHealth: {
  score: {
    type: Number,
    default: 100,
  },
  grade: {
    type: String,
    default: "A",
  },
  breakdown: {
    type: Object,
    default: {},
  },
  recommendations: {
    type: [String],
    default: [],
  },
},
  language: {
    type: String,
    default: 'General',
  },
  model: {
    type: String,
    default: 'llama-3.3-70b-versatile',
  },
  branch: {
  type: String,
  default: "main",
},

commitHash: {
  type: String,
  default: "",
},
  analyzedAt: {
    type: Date,
    default: Date.now,
    expires: 2592000,
  },
});

analyticsSchema.index({ analyzedAt: -1 });
analyticsSchema.index({ repoName: 1, analyzedAt: -1 });

export default mongoose.model('Analytics', analyticsSchema);
