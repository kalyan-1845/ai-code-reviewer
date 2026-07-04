import { globToRegex } from './globToRegex.js';

export { globToRegex };

/**
 * Safely parses JSON from an LLM response text, stripping markdown code fences.
 * Returns {reviews: []} on parse failure instead of throwing.
 */
export function cleanAndParseJSON(responseText) {
  try {
    let cleaned = responseText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    return JSON.parse(cleaned.trim());
  } catch {
    return { reviews: [] };
  }
}
