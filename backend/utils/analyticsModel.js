import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readAll() {
  try {
    if (!fs.existsSync(ANALYTICS_FILE)) return [];
    const raw = fs.readFileSync(ANALYTICS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeAll(records) {
  fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(records, null, 2), 'utf-8');
}

export function saveAnalytics(record) {
  const records = readAll();
  records.push({
    repoName: record.repoName,
    date: record.date || new Date().toISOString(),
    totalIssues: record.totalIssues ?? 0,
    criticalBugs: record.criticalBugs ?? 0,
    linesOfCode: record.linesOfCode ?? 0,
  });
  writeAll(records);
  return records[records.length - 1];
}

export function getSummary() {
  const records = readAll();
  if (records.length === 0) {
    return {
      totalRepos: 0,
      totalIssues: 0,
      totalCriticalBugs: 0,
      totalLinesOfCode: 0,
      averageIssuesPerRepo: 0,
    };
  }
  const totalIssues = records.reduce((sum, r) => sum + r.totalIssues, 0);
  const totalCriticalBugs = records.reduce((sum, r) => sum + r.criticalBugs, 0);
  const totalLinesOfCode = records.reduce((sum, r) => sum + r.linesOfCode, 0);
  return {
    totalRepos: records.length,
    totalIssues,
    totalCriticalBugs,
    totalLinesOfCode,
    averageIssuesPerRepo: Math.round(totalIssues / records.length),
  };
}

export function getTrends(days = 30) {
  const records = readAll();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return records.filter(r => new Date(r.date) >= cutoff).sort((a, b) => new Date(a.date) - new Date(b.date));
}
