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
// MongoDB automatically removes expired documents via the TTL index on createdAt
// (expireAfterSeconds: 1800 = 30 minutes), which replaces the previous in-process
// setInterval cleanup that ran on the repoContexts Map.
//
// IMPORTANT: createdAt is set once on document creation and is NEVER updated.
// Session activity tracking uses the separate lastAccessedAt field. This
// prevents an attacker from keeping a session alive indefinitely by sending
// periodic chat requests (see issue #672).
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
  // Hard upper bound on session lifetime (24 hours after creation).
  // A separate TTL index on this field ensures documents are cleaned up
  // even if the session is actively used.
  absoluteExpiry: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
  },
});

// TTL index: MongoDB removes the document 30 minutes after createdAt.
// createdAt is set once at creation and never updated, so a session
// automatically expires 30 minutes after the analysis, regardless of
// chat activity.
sessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 1800 });

// Secondary TTL index on absoluteExpiry enforces a maximum 24-hour
// session lifetime even if the session is actively used.
sessionSchema.index({ absoluteExpiry: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('Session', sessionSchema);
