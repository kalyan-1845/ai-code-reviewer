export async function up(db) {
  const collections = await db.listCollections().toArray();
  const collectionNames = new Set(collections.map(c => c.name));

  if (collectionNames.has('analytics')) {
    await db.collection('analytics').createIndex({ analyzedAt: -1 }, { background: true });
    await db.collection('analytics').createIndex({ repoName: 1, analyzedAt: -1 }, { background: true });
    await db.collection('analytics').createIndex({ sessionId: 1 }, { background: true, sparse: true });
  }

  if (collectionNames.has('sessions')) {
    await db.collection('sessions').createIndex({ sessionId: 1 }, { unique: true, background: true });
    await db.collection('sessions').createIndex({ absoluteExpiry: 1 }, { expireAfterSeconds: 0, background: true });
    await db.collection('sessions').createIndex({ ownerToken: 1 }, { background: true, sparse: true });
  }
}
