import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sharedConfig = require('../../shared-safety-config.json');
export const DANGEROUS_PHRASES = sharedConfig.dangerous_phrases;
export const HOMOGLYPH_MAP = sharedConfig.homoglyph_map;
