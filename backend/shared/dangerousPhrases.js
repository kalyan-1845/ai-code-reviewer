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
  console.error('SECURITY: Failed to load shared-safety-config.json, prompt injection defenses may be incomplete:', err.message);
  config = { dangerous_phrases: [], homoglyph_map: {} };
}

export const DANGEROUS_PHRASES = config.dangerous_phrases || [];

export const HOMOGLYPH_MAP = config.homoglyph_map || {};
