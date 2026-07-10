// Local persistence so an Archivo-mode session survives a page refresh. DuckDB
// is in-memory, so restoring tables means re-registering the raw CSV bytes — we
// keep them (base64) plus metadata in localStorage. Postgres mode is never
// persisted (we don't store DB credentials).
//
// Two independent keys, written by two owners:
//   - TABLES_KEY: the loaded tables (page.tsx).
//   - TURNS_KEY:  the conversation, tagged with a signature of the tables it ran
//                 against (query-console.tsx). On restore, turns are only
//                 rehydrated if that signature still matches the loaded tables,
//                 so switching datasets doesn't resurrect stale results.

const TABLES_KEY = "askql:tables:v1";
const TURNS_KEY = "askql:turns:v1";

export interface PersistedTable {
  tableName: string;
  fileName: string;
  /** base64 of the CSV bytes registered in DuckDB. */
  csvBase64: string;
}

export interface PersistedTurns {
  /** Signature of the tables these turns ran against (see below). */
  sig: string;
  turns: unknown[];
}

/** Stable signature of a set of loaded tables, used to match persisted turns. */
export function tablesSignature(tableNames: string[]): string {
  return [...tableNames].sort().join("|");
}

// --- base64 (works in both browser and the node test env) ---

export function encodeBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    const chunk = 0x8000; // avoid arg-count limits on String.fromCharCode
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

export function decodeBase64(base64: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(base64, "base64"));
}

export async function fileToBase64(file: Blob): Promise<string> {
  return encodeBase64(new Uint8Array(await file.arrayBuffer()));
}

// --- validation (defensive: localStorage can hold anything) ---

function isPersistedTable(v: unknown): v is PersistedTable {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as PersistedTable).tableName === "string" &&
    typeof (v as PersistedTable).fileName === "string" &&
    typeof (v as PersistedTable).csvBase64 === "string"
  );
}

export function isPersistedTables(v: unknown): v is PersistedTable[] {
  return Array.isArray(v) && v.every(isPersistedTable);
}

export function isPersistedTurns(v: unknown): v is PersistedTurns {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as PersistedTurns).sig === "string" &&
    Array.isArray((v as PersistedTurns).turns)
  );
}

// --- storage wrappers (browser-only; all failures are non-fatal) ---

function readJson(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded (or private mode): drop this key rather than crash — the
    // session just won't survive a refresh.
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

export function saveTables(tables: PersistedTable[]): void {
  writeJson(TABLES_KEY, tables);
}

export function loadTables(): PersistedTable[] | null {
  const v = readJson(TABLES_KEY);
  return isPersistedTables(v) && v.length > 0 ? v : null;
}

export function clearTables(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(TABLES_KEY);
}

export function saveTurns(value: PersistedTurns): void {
  writeJson(TURNS_KEY, value);
}

export function loadTurns(): PersistedTurns | null {
  const v = readJson(TURNS_KEY);
  return isPersistedTurns(v) ? v : null;
}

export function clearTurns(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(TURNS_KEY);
}
