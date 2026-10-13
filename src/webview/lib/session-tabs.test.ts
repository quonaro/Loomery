import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from './state-storage';
import { isString } from './runtime-values';
import {
  closeSessionTab,
  closeSessionTabs,
  getOpenSessionTabs,
  openSessionTab,
  reorderSessionTabs,
  setOpenSessionTabsForTest,
} from './session-tabs';

function storedTabs(): string[] | null {
  const raw = window.localStorage.getItem(STORAGE_KEYS.openSessionTabs);
  if (raw === null) return null;
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return null;
  return parsed.filter(isString);
}

describe('session tabs', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setOpenSessionTabsForTest([]);
  });

  it('appends newly opened sessions and ignores duplicates', () => {
    openSessionTab('a');
    openSessionTab('b');
    openSessionTab('a');

    expect(getOpenSessionTabs()).toEqual(['a', 'b']);
    expect(storedTabs()).toEqual(['a', 'b']);
  });

  it('drops the oldest tabs past the cap', () => {
    for (let index = 0; index < 25; index += 1) openSessionTab(`s-${index}`);

    const tabs = getOpenSessionTabs();
    expect(tabs).toHaveLength(20);
    expect(tabs[0]).toBe('s-5');
    expect(tabs.at(-1)).toBe('s-24');
  });

  it('returns the neighbour when closing a tab', () => {
    setOpenSessionTabsForTest(['a', 'b', 'c']);

    expect(closeSessionTab('b')).toBe('c');
    expect(getOpenSessionTabs()).toEqual(['a', 'c']);

    expect(closeSessionTab('c')).toBe('a');
    expect(closeSessionTab('a')).toBeNull();
    expect(closeSessionTab('missing')).toBeNull();
  });

  it('closes the given tabs and preserves the rest', () => {
    setOpenSessionTabsForTest(['a', 'b', 'c', 'd']);

    closeSessionTabs(['b', 'd']);
    expect(getOpenSessionTabs()).toEqual(['a', 'c']);

    closeSessionTabs([]);
    expect(getOpenSessionTabs()).toEqual(['a', 'c']);

    closeSessionTabs(['missing']);
    expect(getOpenSessionTabs()).toEqual(['a', 'c']);
  });

  it('reorders a tab to the position of its target', () => {
    setOpenSessionTabsForTest(['a', 'b', 'c']);

    reorderSessionTabs('a', 'c');
    expect(getOpenSessionTabs()).toEqual(['b', 'c', 'a']);

    reorderSessionTabs('c', 'b');
    expect(getOpenSessionTabs()).toEqual(['c', 'b', 'a']);

    reorderSessionTabs('missing', 'a');
    expect(getOpenSessionTabs()).toEqual(['c', 'b', 'a']);
  });
});
