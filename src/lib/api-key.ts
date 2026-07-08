// BYOK ("bring your own key"): the user can paste their own Groq API key so
// requests use their quota instead of the shared server key (and skip our
// per-IP rate limit). The key lives only in the browser's localStorage and is
// sent per-request as a header to /api/sql — never persisted on the server.

/** Header carrying the user's own Groq key from the browser to /api/sql. */
export const GROQ_KEY_HEADER = "x-groq-api-key";

const STORAGE_KEY = "askql:groq-api-key";

export function getStoredApiKey(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(STORAGE_KEY)?.trim();
  return value ? value : null;
}

export function setStoredApiKey(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, key.trim());
}

export function clearStoredApiKey(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
