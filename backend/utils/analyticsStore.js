import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORE_PATH = path.join(__dirname, '..', 'analytics_trends.json');
const BACKUP_PATH = STORE_PATH + '.backup';
const TMP_PATH = STORE_PATH + '.tmp';
const MAX_RECORDS = 200;

const LOCK_MAX_RETRIES = 50;
const LOCK_BASE_DELAY_MS = 10;
const LOCK_MAX_DELAY_MS = 1000;

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
        if (!Array.isArray(parsed)) {
          console.warn('⚠️ Analytics store is not an array, attempting backup recovery');
          return recoverFromBackup();
        }
        return parsed;
    } catch (err) {
        console.warn('⚠️ Failed to read analytics store, attempting backup recovery:', err.message);
        return recoverFromBackup();
    }
}

function recoverFromBackup() {
    try {
        if (fs.existsSync(BACKUP_PATH)) {
            const raw = fs.readFileSync(BACKUP_PATH, 'utf-8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                console.warn('✅ Recovered analytics store from backup');
                fs.writeFileSync(STORE_PATH, JSON.stringify(parsed, null, 2));
                return parsed;
            }
        }
    } catch (backupErr) {
        console.warn('⚠️ Backup recovery also failed:', backupErr.message);
    }
    console.warn('⚠️ Starting fresh analytics store');
    return [];
}

function writeStoreAtomic(records) {
    try {
        const data = JSON.stringify(records, null, 2);
        fs.writeFileSync(TMP_PATH, data);
        fs.renameSync(TMP_PATH, STORE_PATH);
        try {
            fs.writeFileSync(BACKUP_PATH, data);
        } catch (backupErr) {
            console.warn('⚠️ Failed to write analytics backup:', backupErr.message);
        }
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
        writeStoreAtomic(trimmed);
    } finally {
        release();
    }
}

export function getTrends() {
    return readStore();
}
