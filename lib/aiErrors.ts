/**
 * AI edge-function errors are surfaced to users as a friendly, retryable
 * message instead of raw text like "Edge function returned a non-2xx status
 * code" or "All models failed — gemini-3.5-flash: 503 …". Non-AI errors
 * (config, upload, consent) are shown verbatim because they're actionable.
 *
 * The technical AI detail is preserved server-side in public.ai_runs, so the
 * UI never needs to expose it.
 */

const AI_ERROR_HINTS = [
  'edge function',
  'non-2xx',
  'non 2xx',
  'models failed',
  'gemini',
  'gemini api error',
];

/** True when `message` looks like a transient AI edge-function failure. */
export function isAiServiceError(message: string): boolean {
  const lower = message.toLowerCase();
  return AI_ERROR_HINTS.some((hint) => lower.includes(hint));
}

/** Friendly, non-scary message shown for transient AI-service failures. */
export const AI_RETRY_MESSAGE =
  'The AI analysis could not complete — the service may be briefly unavailable. Please try again.';
