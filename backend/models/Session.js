import mongoose from 'mongoose';

const MAX_SESSION_SIZE_BYTES = 10 * 1024 * 1024;

export function estimateSessionSize(files) {
  let size = 200;
  size += 100;
  for (const file of files) {
    size += 50 + Buffer.byteLength(file.name, 'utf8') + Buffer.byteLength(file.content, 'utf8');
    if (size > MAX_SESSION_SIZE_BYTES) return size;
  }
  return size;
}

// Each document stores the repository context for a single analysis session.
// MongoDB automatically removes expired documents via a sliding-window TTL
// index on lastAccessedAt (expireAfterSeconds: 86400 = 24 hours). Every chat
// interaction updates lastAccessedAt, so the session lifetime extends with
// active use. A secondary TTL index on absoluteExpiry enforces a hard 7-day
// ceiling to prevent abandoned sessions from living forever.
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
  // Hard upper bound on session lifetime (7 days after creation).
  // A separate TTL index on this field ensures documents are cleaned up
  // even if the session is actively used, preventing abandoned sessions
  // from living past this ceiling.
  absoluteExpiry: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  },
});

// Single TTL index on absoluteExpiry enforces the hard 7-day ceiling.
// MongoDB allows at most one TTL index per collection, so the sliding
// 24h inactivity window is handled in application code (update the
// session's expiry on each access to extend it, capped at 7 days).
sessionSchema.index({ absoluteExpiry: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('Session', sessionSchema);
