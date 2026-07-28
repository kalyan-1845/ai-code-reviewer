/**
 * backend/services/analyticsAggregator.js
 * ----------------------------------------
 * Architectural Health Aggregator & Maintainability Index Engine
 *
 * Computes Microsoft Maintainability Index (MI):
 *   MI = 171 - 5.2 * ln(HV) - 0.23 * CC - 16.2 * ln(LoC)
 *
 * Where:
 *   HV  = Halstead Volume  (proxy: unique operators/operands * ln(diff_lines))
 *   CC  = Cyclomatic Complexity
 *   LoC = Lines of Code (non-empty, non-comment lines)
 *
 * MI is clamped to [0, 100]. Values >= 85 = "Highly Maintainable",
 * 65-85 = "Moderately Maintainable", < 65 = "Low Maintainability".
 *
 * Reads history from backend/data/history.json (file-based store for
 * runs that do not have a MongoDB connection).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTrends } from '../utils/analyticsStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// File-based persistent store — backend/data/history.json
// ---------------------------------------------------------------------------
const DATA_DIR  = path.join(__dirname, '..', 'data');
const HIST_PATH = path.join(DATA_DIR, 'history.json');
const HIST_TMP  = HIST_PATH + '.tmp';

const MAX_HISTORY_RECORDS = 500;

let _histLock = Promise.resolve();

async function _acquireLock() {
  let release;
  const prev = _histLock;
  _histLock = new Promise(res => { release = res; });
  await prev;
  return release;
}

function _ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function _readHistory() {
  _ensureDataDir();
  try {
    if (!fs.existsSync(HIST_PATH)) return [];
    const raw = fs.readFileSync(HIST_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function _writeHistoryAtomic(records) {
  _ensureDataDir();
  const data = JSON.stringify(records, null, 2);
  fs.writeFileSync(HIST_TMP, data, 'utf-8');
  try {
    fs.renameSync(HIST_TMP, HIST_PATH);
  } catch {
    fs.writeFileSync(HIST_PATH, data, 'utf-8');
    try { fs.unlinkSync(HIST_TMP); } catch { /* ignore */ }
  }
}

/**
 * Append a run snapshot to history.json atomically.
 * @param {object} snapshot
 */
export async function appendHistory(snapshot) {
  const release = await _acquireLock();
  try {
    const records = _readHistory();
    records.push({ ...snapshot, timestamp: snapshot.timestamp || new Date().toISOString() });
    _writeHistoryAtomic(records.slice(-MAX_HISTORY_RECORDS));
  } finally {
    release();
  }
}

/**
 * Read all history.json records.
 * @returns {object[]}
 */
export function readHistory() {
  return _readHistory();
}

// ---------------------------------------------------------------------------
// Maintainability Index formula
// ---------------------------------------------------------------------------

/**
 * Calculate Microsoft Maintainability Index (MI).
 *
 * @param {object} params
 * @param {number} [params.halsteadVolume]   Halstead Volume (HV). Defaults computed from LoC if absent.
 * @param {number} [params.cyclomaticComplexity] Cyclomatic Complexity (CC). Defaults to 1.
 * @param {number} [params.linesOfCode]      Total non-empty lines of code (LoC). Defaults to 1.
 * @returns {number} MI score clamped to [0, 100], rounded to 2 decimal places.
 */
export function calculateMaintainabilityIndex({ halsteadVolume, cyclomaticComplexity, linesOfCode } = {}) {
  const loc = Math.max(1, Number(linesOfCode)       || 1);
  const cc  = Math.max(1, Number(cyclomaticComplexity) || 1);

  // If HV is not provided, use a reasonable proxy:
  // HV ≈ LoC * ln(LoC) (standard approximation for unknown operand counts)
  const hv  = Math.max(1, Number(halsteadVolume)    || loc * Math.log(loc));

  const mi = 171 - (5.2 * Math.log(hv)) - (0.23 * cc) - (16.2 * Math.log(loc));
  return Math.round(Math.max(0, Math.min(100, mi)) * 100) / 100;
}

/**
 * Interpret an MI score as a maintainability grade label.
 * @param {number} mi
 * @returns {'High'|'Moderate'|'Low'}
 */
export function maintainabilityGrade(mi) {
  if (mi >= 85) return 'High';
  if (mi >= 65) return 'Moderate';
  return 'Low';
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

/**
 * Compute overview metrics across a set of run records.
 *
 * @param {object[]} records  Array of analytics run records.
 * @returns {object}
 */
export function computeOverview(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return {
      totalRuns: 0,
      totalLinesReviewed: 0,
      avgMaintainabilityIndex: null,
      maintainabilityGrade: null,
      avgCyclomaticComplexity: null,
      vulnerabilityDensity: null,
      totalSecurityIssues: 0,
      totalBugs: 0,
    };
  }

  let totalLines = 0;
  let totalCC = 0;
  let totalSecurity = 0;
  let totalBugs = 0;
  let totalMI = 0;
  let miCount = 0;

  for (const r of records) {
    const loc = Number(r.totalLines) || 0;
    const cc  = Number(r.cyclomaticComplexity) || Number(r.complexityScore) || 1;
    const hv  = Number(r.halsteadComplexity) || undefined;

    totalLines   += loc;
    totalCC      += cc;
    totalSecurity += Number(r.security) || Number(r.totalSecurityIssues) || 0;
    totalBugs    += Number(r.bugs)     || Number(r.totalBugs)     || 0;

    const mi = calculateMaintainabilityIndex({ halsteadVolume: hv, cyclomaticComplexity: cc, linesOfCode: Math.max(1, loc) });
    totalMI += mi;
    miCount++;
  }

  const avgMI = miCount > 0 ? Math.round((totalMI / miCount) * 100) / 100 : null;
  const avgCC = records.length > 0 ? Math.round((totalCC / records.length) * 100) / 100 : null;
  // Vulnerability density = security issues per 1000 lines reviewed
  const vulnDensity = totalLines > 0 ? Math.round((totalSecurity / totalLines) * 1000 * 100) / 100 : 0;

  return {
    totalRuns: records.length,
    totalLinesReviewed: totalLines,
    avgMaintainabilityIndex: avgMI,
    maintainabilityGrade: avgMI !== null ? maintainabilityGrade(avgMI) : null,
    avgCyclomaticComplexity: avgCC,
    vulnerabilityDensity: vulnDensity,
    totalSecurityIssues: totalSecurity,
    totalBugs,
  };
}

/**
 * Build time-series trend entries from run records.
 * Groups by calendar day (UTC) and returns sorted ascending.
 *
 * @param {object[]} records
 * @param {number} [days=30]  Look-back window in days.
 * @returns {object[]}
 */
export function computeTrends(records, days = 30) {
  if (!Array.isArray(records) || records.length === 0) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const byDay = new Map();

  for (const r of records) {
    const ts = r.timestamp ? new Date(r.timestamp) : null;
    if (!ts || ts < cutoff) continue;

    const dateKey = ts.toISOString().slice(0, 10); // YYYY-MM-DD
    if (!byDay.has(dateKey)) {
      byDay.set(dateKey, { date: dateKey, runs: 0, totalLines: 0, totalCC: 0, totalMI: 0, totalSecurity: 0, totalBugs: 0 });
    }
    const day = byDay.get(dateKey);
    const loc = Math.max(1, Number(r.totalLines) || 1);
    const cc  = Number(r.cyclomaticComplexity) || Number(r.complexityScore) || 1;
    const hv  = Number(r.halsteadComplexity) || undefined;
    const mi  = calculateMaintainabilityIndex({ halsteadVolume: hv, cyclomaticComplexity: cc, linesOfCode: loc });

    day.runs       += 1;
    day.totalLines += loc;
    day.totalCC    += cc;
    day.totalMI    += mi;
    day.totalSecurity += Number(r.security) || Number(r.totalSecurityIssues) || 0;
    day.totalBugs  += Number(r.bugs)        || Number(r.totalBugs)     || 0;
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, day]) => ({
      date: day.date,
      runs: day.runs,
      avgMaintainabilityIndex: day.runs > 0 ? Math.round((day.totalMI / day.runs) * 100) / 100 : null,
      avgCyclomaticComplexity: day.runs > 0 ? Math.round((day.totalCC / day.runs) * 100) / 100 : null,
      totalLinesReviewed: day.totalLines,
      totalSecurityIssues: day.totalSecurity,
      totalBugs: day.totalBugs,
    }));
}

/**
 * Load records from both file-based history.json AND the analyticsStore
 * (analytics_trends.json) and merge them, deduplicating by timestamp+repoName.
 * @returns {object[]}
 */
export function loadAllRecords() {
  const histRecords = _readHistory();
  let storeRecords = [];
  try {
    storeRecords = getTrends();
  } catch { /* non-fatal */ }

  // Merge: storeRecords are shaped slightly differently — normalise them
  const mapped = storeRecords.map(r => ({
    timestamp: r.timestamp,
    repoName: r.repoName,
    totalLines: r.totalLines,
    cyclomaticComplexity: r.cyclomaticComplexity,
    halsteadComplexity: r.halsteadComplexity,
    security: r.security,
    bugs: r.bugs,
  }));

  // Deduplicate by timestamp+repoName
  const seen = new Set(histRecords.map(r => `${r.timestamp}|${r.repoName}`));
  const merged = [...histRecords];
  for (const r of mapped) {
    const key = `${r.timestamp}|${r.repoName}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(r);
    }
  }

  return merged.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
}
