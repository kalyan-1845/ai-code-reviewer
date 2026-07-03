import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORE_PATH = path.join(__dirname, '..', 'analytics_trends.json');
const MAX_RECORDS = 200;

const LOCK_MAX_RETRIES = 50;
const LOCK_BASE_DELAY_MS = 10;
const LOCK_MAX_DELAY_MS = 1000;
const LOCK_STALE_MS = 10000;

let storeLock = Promise.resolve();

async function acquireLock() {
  for (let attempt = 0; attempt < LOCK_MAX_RETRIES; attempt++) {
    const prev = storeLock;
    let release;
    const next = new Promise(resolve => { release = resolve; });
    if (storeLock === prev) {
      storeLock = next;
      return release;
    }
    const delay = Math.min(
      LOCK_BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 50,
      LOCK_MAX_DELAY_MS
    );
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw new Error(`Could not acquire analytics store lock after ${LOCK_MAX_RETRIES} attempts`);
}

function readStore() {
    try {
        if (!fs.existsSync(STORE_PATH)) return [];
        const raw = fs.readFileSync(STORE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.warn('Failed to read analytics store, starting fresh:', err.message);
        return [];
    }
}

function writeStore(records) {
    try {
        fs.writeFileSync(STORE_PATH, JSON.stringify(records, null, 2));
    } catch (err) {
        console.warn('Failed to write analytics store:', err.message);
    }
}

export async function recordAnalysis(record) {
    const release = await acquireLock();
    try {
      const records = readStore();
      records.push({
          timestamp: new Date().toISOString(),
          repoName: record.repoName || 'unknown',
          totalLines: record.totalLines || 0,
          bugs: record.bugs || 0,
          security: record.security || 0,
          optimization: record.optimization || 0,
          styling: record.styling || 0,
          filesCount: record.filesCount || 0,
      });

      const trimmed = records.slice(-MAX_RECORDS);
      writeStore(trimmed);
    } finally {
      release();
    }
}

export function getTrends() {
    return readStore();
}