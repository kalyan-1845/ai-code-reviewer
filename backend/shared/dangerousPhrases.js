import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let config;
try {
  const configPath = path.resolve(__dirname, '../../shared-safety-config.json');
  config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
} catch (err) {
  // Fail-closed: do NOT silently fall back to an empty phrase list, which would
  // disable prompt-injection protection. Surface the failure loudly and refuse
  // to start without the safety configuration.
  console.error('SECURITY: Failed to load shared-safety-config.json, prompt injection defenses cannot start safely:', err.message);
  throw new Error('Failed to load shared-safety-config.json required for prompt-injection protection: ' + err.message);
}

export const DANGEROUS_PHRASES = config.dangerous_phrases || [];

export const HOMOGLYPH_MAP = config.homoglyph_map || {};
