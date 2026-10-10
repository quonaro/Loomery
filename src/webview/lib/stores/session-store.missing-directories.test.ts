import { beforeEach, describe, expect, it } from 'vitest';
import {
  isSessionDirectoryMissing,
  isSessionReadOnly,
  markSessionDirectoryMissing,
  sessionStore,
  unmarkSessionDirectoryMissing,
} from './session-store';
import { setState } from '../state';

describe('missing session directories', () => {
  beforeEach(() => {
    setState('missingSessionDirectories', []);
  });

  it('marks and detects a missing directory by workspace-equivalent path', () => {
    markSessionDirectoryMissing('/repo/gone');
    expect(isSessionDirectoryMissing('/repo/gone')).toBe(true);
    expect(isSessionDirectoryMissing('/repo/gone/')).toBe(true);
    expect(isSessionDirectoryMissing('/repo/other')).toBe(false);
    expect(isSessionDirectoryMissing(null)).toBe(false);
  });

  it('deduplicates repeated marks and unmarks matches', () => {
    markSessionDirectoryMissing('/repo/gone');
    markSessionDirectoryMissing('/repo/gone/');
    expect(sessionStore.isSessionReadOnly({ directory: '/repo/gone' })).toBe(true);

    unmarkSessionDirectoryMissing('/repo/gone/');
    expect(isSessionDirectoryMissing('/repo/gone')).toBe(false);
  });

  it('treats only sessions in a missing directory as read-only', () => {
    markSessionDirectoryMissing('/repo/gone');
    expect(isSessionReadOnly({ directory: '/repo/gone' })).toBe(true);
    expect(isSessionReadOnly({ directory: '/repo/live' })).toBe(false);
    expect(isSessionReadOnly(null)).toBe(false);
    expect(isSessionReadOnly({})).toBe(false);
  });
});
