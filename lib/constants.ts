export const CANDIDATE_MIN_SIMILARITY = 0.7; // below this, a cluster isn't even shown to the judge
export const AUTO_JOIN_SIMILARITY = 0.95;    // near-duplicates skip the judge
export const SIMILARITY_THRESHOLD = 0.80; // tune with seed data
export const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
export const GEMINI_TEXT_MODEL = "gemini-flash-lite-latest";
export const GEMINI_TEXT_MODEL_FALLBACK = "gemini-3-flash-preview"; // verify against AI Studio's current model list

export const MIN_DOUBT_LENGTH = 10;
export const MAX_DOUBT_LENGTH = 500;

export const RATE_LIMIT_MAX = 5;
export const RATE_LIMIT_WINDOW_MS = 30_000;