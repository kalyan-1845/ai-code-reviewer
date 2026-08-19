export const CHAT_INJECTION_PHRASES = [
  "ignore all instructions",
  "ignore previous",
  "forget everything",
  "you are now",
  "new instructions",
] as const;

/**
 * Check a single message (the one the user is sending now) for prompt-injection
 * phrases. Returns the matched phrase or null. Only the newly submitted message
 * is scanned — past history (including assistant replies) must never block
 * future messages.
 */
export function findChatInjectionPhrase(text: string): string | null {
  if (!text) return null;
  const lowered = text.toLowerCase();
  for (const phrase of CHAT_INJECTION_PHRASES) {
    if (lowered.includes(phrase)) return phrase;
  }
  return null;
}
