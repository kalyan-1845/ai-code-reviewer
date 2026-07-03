import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORE_PATH = path.join(__dirname, '..', 'analytics_trends.json');
const BACKUP_PATH = STORE_PATH + '.backup';
const TMP_PATH = STORE_PATH + '.tmp';
const MAX_RECORDS = 200;

let writeQueue = Promise.resolve();

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
        console.warn('⚠️ Failed to write analytics store:', err.message);
    }
}

export async function recordAnalysis(record) {
    writeQueue = writeQueue.then(() => {
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
    });
    return writeQueue;
}

export function getTrends() {
    return readStore();
}
