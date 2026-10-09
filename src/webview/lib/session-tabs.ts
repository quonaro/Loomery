import { createSignal } from 'solid-js';
import { isString } from './runtime-values';
import { STORAGE_KEYS, readStored, writeStored } from './state-storage';

/** Upper bound on remembered tabs. Older tabs drop off the front once the
    strip grows past this, so a long-lived window cannot accumulate stale ids
    forever. */
const MAX_OPEN_TABS = 20;

/**
 * Synthetic tab id for the unsaved New chat draft. Real session ids never start
 * with a double underscore, so this can never collide with a session. The draft
 * tab is removed as soon as a real session becomes active.
 */
export const NEW_SESSION_TAB_ID = '__loomery_new_session__';

function readInitialOpenTabs(): string[] {
  const stored = readStored<unknown>(STORAGE_KEYS.openSessionTabs);
  if (!Array.isArray(stored)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of stored) {
    if (!isString(value) || value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    ids.push(value);
  }
  return ids;
}

const [openSessionTabs, setOpenSessionTabs] = createSignal<string[]>(readInitialOpenTabs());

function commit(next: string[]) {
  setOpenSessionTabs(next);
  writeStored(STORAGE_KEYS.openSessionTabs, next);
}

/** Open session tabs in display order. */
export function getOpenSessionTabs(): readonly string[] {
  return openSessionTabs();
}

/** Adds a session to the strip if it is not already open, appending it last. */
export function openSessionTab(sessionId: string): void {
  if (!sessionId) return;
  const current = openSessionTabs();
  if (current.includes(sessionId)) return;
  const next = [...current, sessionId];
  if (next.length > MAX_OPEN_TABS) next.splice(0, next.length - MAX_OPEN_TABS);
  commit(next);
}

/**
 * Removes a session from the strip and returns the tab that should become
 * active if the removed tab was the active one (the next tab, else the
 * previous one, else null when the strip became empty).
 */
export function closeSessionTab(sessionId: string): string | null {
  const current = openSessionTabs();
  const index = current.indexOf(sessionId);
  if (index === -1) return null;
  const next = current.filter((id) => id !== sessionId);
  commit(next);
  return next[index] ?? next[index - 1] ?? null;
}

/** Closes every tab except `keepId`, leaving it as the only open tab. */
export function closeOtherSessionTabs(keepId: string): void {
  const current = openSessionTabs();
  if (!current.includes(keepId) || current.length === 1) return;
  commit([keepId]);
}

/** Closes tabs positioned after `id`, keeping it and everything to its left. */
export function closeSessionTabsToTheRight(id: string): void {
  const current = openSessionTabs();
  const index = current.indexOf(id);
  if (index === -1 || index >= current.length - 1) return;
  commit(current.slice(0, index + 1));
}

/** Moves `sourceId` to the position of `targetId`, preserving the rest. */
export function reorderSessionTabs(sourceId: string, targetId: string): void {
  const current = openSessionTabs();
  const from = current.indexOf(sourceId);
  const to = current.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) return;
  const next = [...current];
  next.splice(from, 1);
  next.splice(to, 0, sourceId);
  commit(next);
}

/** Test seam: replace the strip without touching storage. */
export function setOpenSessionTabsForTest(ids: readonly string[]): void {
  setOpenSessionTabs([...ids]);
}
