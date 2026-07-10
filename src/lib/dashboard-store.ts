import { useSyncExternalStore } from "react";
import type { QueryResult } from "@/lib/run-query";

// A reactive, localStorage-backed store of "pinned" query results — the
// dashboard. Results are already serializable (same as the session store), so a
// pinned card carries everything needed to re-render its chart/table without
// re-querying. Components read it via `useDashboard()`.

export interface PinnedCard {
  /** The originating turn's id, so a turn can be pinned/unpinned idempotently. */
  id: string;
  question: string;
  interpretation: string;
  sql: string;
  result: QueryResult;
}

const KEY = "askql:dashboard:v1";
const MAX_CARDS = 24;

// --- pure list ops (unit-tested) ---

export function addCard(list: PinnedCard[], card: PinnedCard): PinnedCard[] {
  if (list.some((c) => c.id === card.id)) return list; // already pinned
  return [...list, card].slice(-MAX_CARDS);
}

export function removeById(list: PinnedCard[], id: string): PinnedCard[] {
  return list.filter((c) => c.id !== id);
}

/** Swaps a card with its neighbour (dir -1 = earlier, +1 = later). No-op at the ends. */
export function moveCard(list: PinnedCard[], id: string, dir: -1 | 1): PinnedCard[] {
  const i = list.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const copy = [...list];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

// --- storage + reactive plumbing ---

const EMPTY: PinnedCard[] = [];

function isPinnedCard(v: unknown): v is PinnedCard {
  const c = v as PinnedCard;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof c.id === "string" &&
    typeof c.question === "string" &&
    typeof c.sql === "string" &&
    typeof c.result === "object" &&
    c.result !== null
  );
}

function load(): PinnedCard[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(isPinnedCard) ? (parsed as PinnedCard[]) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function persist(list: PinnedCard[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
}

let items: PinnedCard[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

// Loaded lazily on first subscribe (never during render) so the initial
// client snapshot matches the server's empty one — no hydration mismatch.
function ensureLoaded() {
  if (!loaded && typeof window !== "undefined") {
    items = load();
    loaded = true;
  }
}

function commit(next: PinnedCard[]) {
  items = next;
  persist(items);
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  ensureLoaded();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PinnedCard[] {
  return items;
}

export function pin(card: PinnedCard): void {
  ensureLoaded();
  commit(addCard(items, card));
}

export function unpin(id: string): void {
  ensureLoaded();
  commit(removeById(items, id));
}

export function reorder(id: string, dir: -1 | 1): void {
  ensureLoaded();
  commit(moveCard(items, id, dir));
}

export function clearDashboard(): void {
  ensureLoaded();
  commit(EMPTY);
}

/** Subscribe a component to the dashboard list. */
export function useDashboard(): PinnedCard[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
