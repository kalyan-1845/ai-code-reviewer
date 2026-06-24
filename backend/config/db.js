import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/reposage';

let isConnected = false;
let connectionPromise = null;

const RECONNECT_INTERVAL_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 5;

export async function connectDatabase() {
  if (isConnected) return;
  if (connectionPromise) return connectionPromise;

  connectionPromise = mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
    .then((conn) => {
      isConnected = true;
      console.log('✅ Connected to MongoDB via config/db.js');
      return conn;
    })
    .catch((err) => {
      isConnected = false;
      connectionPromise = null;
      console.warn('⚠️ MongoDB connection failed, analytics will not be persisted:', err.message);
      return null;
    });

  return connectionPromise;
}

export function isDatabaseConnected() {
  return isConnected;
}

export async function ensureConnection() {
  if (isConnected) return true;

  let reconnectAttempts = 0;
  while (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts++;
    console.log(`🔄 Reconnecting to MongoDB (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
    try {
      connectionPromise = null;
      await connectDatabase();
      if (isConnected) {
        reconnectAttempts = 0;
        return true;
      }
    } catch {
      // retry
    }
    await new Promise(r => setTimeout(r, RECONNECT_INTERVAL_MS));
  }

  reconnectAttempts = 0;
  console.warn('⚠️ Max reconnect attempts reached. Running without database.');
  return false;
}

export async function closeDatabase() {
  if (!isConnected) return;
  try {
    await mongoose.disconnect();
    isConnected = false;
    connectionPromise = null;
    console.log('🔌 MongoDB connection closed.');
  } catch (err) {
    console.warn('⚠️ Error closing MongoDB connection:', err.message);
  }
}

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  console.warn('⚠️ MongoDB disconnected. Analytics will not be persisted.');
});

mongoose.connection.on('error', (err) => {
  console.warn('⚠️ MongoDB connection error:', err.message);
});

export default {
  connectDatabase,
  isDatabaseConnected,
  ensureConnection,
  closeDatabase,
};
