import { render } from 'solid-js/web';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../types';
import { setSessions, setState } from '../../lib/state';
import {
  NEW_SESSION_TAB_ID,
  getOpenSessionTabs,
  setOpenSessionTabsForTest,
} from '../../lib/session-tabs';
import { selectSession } from '../../hooks/useOpenCode';
import { SessionTabs } from './SessionTabs';

/* oxlint-disable anti-slop/no-module-mocking -- These tests exercise SessionTabs' useOpenCode module integration. */
vi.mock('../../hooks/useOpenCode', () => ({
  selectSession: vi.fn(),
}));

function session(id: string, updated: number, title = `Session ${id}`): Session {
  return {
    id,
    projectID: 'project-1',
    directory: `/repo/${id}`,
    title,
    version: '1',
    time: { created: updated - 1_000, updated },
    summary: { files: 0, additions: 0, deletions: 0 },
  };
}

let container: HTMLDivElement;
let cleanup: (() => void) | undefined;

beforeEach(() => {
  setState('sessions', []);
  setState('activeSessionId', null);
  setState('sessionStatus', {});
  setState('failedSessionIds', []);
  setOpenSessionTabsForTest([]);
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  container.remove();
  setState('sessions', []);
  setState('activeSessionId', null);
  setState('sessionStatus', {});
  setState('failedSessionIds', []);
  setOpenSessionTabsForTest([]);
  vi.restoreAllMocks();
});

describe('SessionTabs', () => {
  it('opens the active session as a tab and renders other open sessions', () => {
    setSessions([session('a', 3), session('b', 2)]);
    setState('activeSessionId', 'a');
    setOpenSessionTabsForTest(['a', 'b']);

    cleanup = render(() => <SessionTabs onCreateSession={() => {}} />, container);

    const tabs = container.querySelectorAll('.session-tab');
    expect(tabs).toHaveLength(2);
    expect(container.querySelector('.session-tab.is-active .session-tab-title')?.textContent).toBe(
      'Session a'
    );
    expect(getOpenSessionTabs()).toEqual(['a', 'b']);
  });

  it('labels an untitled session tab as New Session', () => {
    setSessions([session('a', 3, '')]);
    setState('activeSessionId', 'a');
    setOpenSessionTabsForTest(['a']);

    cleanup = render(() => <SessionTabs onCreateSession={() => {}} />, container);

    expect(container.querySelector('.session-tab-title')?.textContent).toBe('New Session');
  });

  it('renders the unsaved draft as an active New Session tab', () => {
    setOpenSessionTabsForTest([NEW_SESSION_TAB_ID]);
    setState('activeSessionId', null);

    cleanup = render(() => <SessionTabs onCreateSession={() => {}} />, container);

    const activeTab = container.querySelector('.session-tab.is-active.is-draft');
    expect(activeTab?.querySelector('.session-tab-title')?.textContent).toBe('New Session');
  });

  it('retires the draft tab when a real session becomes active', async () => {
    setSessions([session('a', 3)]);
    setState('activeSessionId', null);
    setOpenSessionTabsForTest([NEW_SESSION_TAB_ID, 'a']);

    cleanup = render(() => <SessionTabs onCreateSession={() => {}} />, container);
    expect(getOpenSessionTabs()).toContain(NEW_SESSION_TAB_ID);

    setState('activeSessionId', 'a');

    await vi.waitFor(() => expect(getOpenSessionTabs()).toEqual(['a']));
  });

  it('switches sessions when a tab is clicked', () => {
    setSessions([session('a', 3), session('b', 2)]);
    setState('activeSessionId', 'a');
    setOpenSessionTabsForTest(['a', 'b']);

    cleanup = render(() => <SessionTabs onCreateSession={() => {}} />, container);

    container.querySelectorAll<HTMLElement>('.session-tab')[1]!.click();

    expect(selectSession).toHaveBeenCalledWith('b', { directory: '/repo/b' });
  });

  it('closes a tab and switches to the neighbour when the active tab closes', () => {
    setSessions([session('a', 3), session('b', 2)]);
    setState('activeSessionId', 'a');
    setOpenSessionTabsForTest(['a', 'b']);

    cleanup = render(() => <SessionTabs onCreateSession={() => {}} />, container);

    container
      .querySelector<HTMLButtonElement>('.session-tab.is-active .session-tab-close')!
      .click();

    expect(getOpenSessionTabs()).toEqual(['b']);
    expect(selectSession).toHaveBeenCalledWith('b', { directory: '/repo/b' });
  });

  it('skips hidden unavailable tabs when choosing the neighbour on close', () => {
    setSessions([session('a', 3), session('b', 2)]);
    setState('activeSessionId', 'a');
    // 'stale' has no loaded session (removed or from another workspace).
    setOpenSessionTabsForTest(['a', 'stale', 'b']);

    cleanup = render(() => <SessionTabs onCreateSession={() => {}} />, container);

    container
      .querySelector<HTMLButtonElement>('.session-tab.is-active .session-tab-close')!
      .click();

    expect(selectSession).toHaveBeenCalledExactlyOnceWith('b', { directory: '/repo/b' });
    expect(selectSession).not.toHaveBeenCalledWith('stale', expect.anything());
  });

  it('does not select an unavailable tab when closing the last visible tab', () => {
    setSessions([session('a', 3)]);
    setState('activeSessionId', 'a');
    setOpenSessionTabsForTest(['a', 'stale']);

    cleanup = render(() => <SessionTabs onCreateSession={() => {}} />, container);

    container
      .querySelector<HTMLButtonElement>('.session-tab.is-active .session-tab-close')!
      .click();

    expect(selectSession).not.toHaveBeenCalled();
    expect(getOpenSessionTabs()).toEqual(['stale']);
  });

  it('renders the new-session button in the strip and creates a session when clicked', () => {
    const onCreateSession = vi.fn();
    setSessions([session('a', 3)]);
    setState('activeSessionId', 'a');
    setOpenSessionTabsForTest(['a']);

    cleanup = render(() => <SessionTabs onCreateSession={onCreateSession} />, container);

    const newChat = container.querySelector<HTMLButtonElement>(
      '.session-tabs-new [aria-label="New chat"]'
    );
    expect(newChat).toBeInstanceOf(HTMLButtonElement);
    newChat!.click();
    expect(onCreateSession).toHaveBeenCalledOnce();
  });

  it('shows the new-session button even when no tabs are open', () => {
    setOpenSessionTabsForTest([]);

    cleanup = render(() => <SessionTabs onCreateSession={() => {}} />, container);

    expect(container.querySelectorAll('.session-tab')).toHaveLength(0);
    expect(container.querySelector('.session-tabs-new [aria-label="New chat"]')).toBeInstanceOf(
      HTMLButtonElement
    );
  });
});
