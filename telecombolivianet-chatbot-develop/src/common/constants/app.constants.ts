
export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export const APP_CONSTANTS = {
  session: {
    PROSPECT_SENTINEL: '__prospect__',
    UNKNOWN_CLIENT:    '__unknown__',
  },
  debounce: {
    WINDOW_MS: 2_500,
    TTL_MS:    5_000,
  },
  rateLimiter: {
    DEFAULT_WINDOW_SECS:  60,
    DEFAULT_MAX_REQUESTS: 20,
  },
  rag: {
    FAIL_COUNT_THRESHOLD:  3,
    FAIL_WINDOW_MS:        10 * 60 * 1_000,
    MAX_REACT_LOOPS:       5,
    EMBED_CHUNK_DELAY_MS:  1_200,
    EMBED_RETRY_BASE_MS:   35_000,
  },
  sentiment: {
    ANGRY_ESCALATION_THRESHOLD: 3,
  },
  lock: {
    SESSION_TTL_MS:    30_000,
    REMINDER_LOCK_KEY: 20250101,
  },
  whatsapp: {
    SEND_RETRY_DELAY_MS: 3_000,
    MAX_MESSAGE_CHARS:   4_096,
  },
} as const;
