import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORE_PATH = path.join(__dirname, '..', 'analytics_trends.json');
const MAX_RECORDS = 200;

function readStore() {
    try {
        if (!fs.existsSync(STORE_PATH)) return [];
        const raw = fs.readFileSync(STORE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.warn('⚠️ Failed to read analytics store, starting fresh:', err.message);
        return [];
    }
}

function writeStore(records) {
    try {
        fs.writeFileSync(STORE_PATH, JSON.stringify(records, null, 2));
    } catch (err) {
        console.warn('⚠️ Failed to write analytics store:', err.message);
    }
}

export function recordAnalysis(record) {
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
}

export function getTrends() {
    return readStore();
}