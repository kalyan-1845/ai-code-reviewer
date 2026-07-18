import mongoose from 'mongoose';
import { isValidUuid } from '../utils/authMiddleware.js';

const MAX_SESSION_SIZE_BYTES = 10 * 1024 * 1024;

export function estimateSessionSize(files) {
  let size = 200;
  size += 100;
  for (const file of files) {
    size += 50 + Math.round(1.5 * (Buffer.byteLength(file.name, 'utf8') + Buffer.byteLength(file.content, 'utf8')));
    if (size > MAX_SESSION_SIZE_BYTES) return size;
  }
  return size;
}

// Each document stores the repository context for a single analysis session.
// MongoDB removes expired documents via a single TTL index on absoluteExpiry
// (expireAfterSeconds: 0). The initial default is 24h from creation. Every
// chat interaction extends absoluteExpiry to 24h from now via $max in
// application code, so active sessions stay alive.
// MongoDB allows at most one TTL index per collection.
//
// IMPORTANT: createdAt is set once on document creation and is NEVER updated.
// It is kept for audit purposes only; the slash command window is driven by
// lastAccessedAt (see issues #672, #743).
const sessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  csrfToken: {
    type: String,
    default: null,
  },
  repoUrl: {
    type: String,
    required: true,
  },
  repoName: {
    type: String,
    required: true,
  },
  // File list is stored as an array of subdocuments {name, content}.
  // _id generation is disabled on subdocuments to keep the stored size smaller.
  files: {
    type: [
      {
        _id: false,
        name: { type: String, required: true },
        content: { type: String, required: true },
      },
    ],
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // Tracks the last time this session was accessed via chat. This is the
  // field that gets updated on each chat request, NOT createdAt.
  // Tracks which client created this session, used to prevent IDOR
  // where one authenticated user accesses another user's session.
  ownerToken: {
    type: String,
    index: true,
  },
  lastAccessedAt: {
    type: Date,
    default: Date.now,
  },
  // TTL-based expiry: session is deleted when this timestamp is reached.
  // Default is 24h from creation. Application code extends it to 24h from
  // the last activity via $max on each chat interaction, implementing the
  // sliding-window expiry. The TTL index (expireAfterSeconds: 0) removes
  // the document when absoluteExpiry is reached.
  absoluteExpiry: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
  },
});

// Shared validation function to block NoSQL injection via sessionId operator injection.
// If the filter contains a non-string sessionId (e.g. { $ne: '' }), reject.
function validateSessionIdFilter(next) {
  const filter = this.getFilter();
  if (filter && typeof filter.sessionId === 'object' && !Array.isArray(filter.sessionId)) {
    return next(new mongoose.Error('Invalid sessionId filter: object/operator injection detected'));
  }
  if (filter && filter.sessionId && !isValidUuid(filter.sessionId)) {
    return next(new mongoose.Error('Invalid sessionId format in query'));
  }
  next();
}

// Register the validation hook on all query methods that accept sessionId filters
['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'deleteOne', 'updateOne'].forEach(method => {
  sessionSchema.pre(method, validateSessionIdFilter);
});

// Single TTL index on absoluteExpiry. Document is deleted the moment
// absoluteExpiry is reached. The sliding 24h window is handled by
// application code ($max on each chat interaction).
sessionSchema.index({ absoluteExpiry: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('Session', sessionSchema);
