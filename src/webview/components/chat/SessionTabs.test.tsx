import { render } from 'solid-js/web';
import { reconcile } from 'solid-js/store';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Permission, Session } from '../../types';
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

function permission(sessionId: string): Permission {
  return {
    id: `perm-${sessionId}`,
    type: 'bash',
    sessionID: sessionId,
    messageID: `message-${sessionId}`,
    title: 'Run command',
    metadata: {},
    time: { created: 1 },
  };
}

let container: HTMLDivElement;
let cleanup: (() => void) | undefined;

beforeEach(() => {
  setState('sessions', []);
  setState('activeSessionId', null);
  setState('sessionStatus', reconcile({}));
  setState('failedSessionIds', []);
  setState('permissions', []);
  setState('questions', []);
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
  setState('sessionStatus', reconcile({}));
  setState('failedSessionIds', []);
  setState('permissions', []);
  setState('questions', []);
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

  it('retires the draft tab without opening the active session when autoOpenActive is false', async () => {
    setSessions([session('a', 3)]);
    setOpenSessionTabsForTest([NEW_SESSION_TAB_ID]);

    cleanup = render(
      () => <SessionTabs onCreateSession={() => {}} autoOpenActive={false} />,
      container
    );

    setState('activeSessionId', 'a');

    await vi.waitFor(() => expect(getOpenSessionTabs()).toEqual([]));
    expect(container.querySelectorAll('.session-tab')).toHaveLength(0);
  });

  it('shows the running dot while a session is generating', () => {
    setSessions([session('a', 3)]);
    setState('activeSessionId', 'a');
    setState('sessionStatus', 'a', { type: 'busy' });
    setOpenSessionTabsForTest(['a']);

    cleanup = render(() => <SessionTabs onCreateSession={() => {}} />, container);

    expect(container.querySelector('.session-tab-dot.is-running')).toBeInstanceOf(HTMLElement);
  });

  it('shows the awaiting dot when a session has a pending permission', () => {
    setSessions([session('a', 3)]);
    setState('activeSessionId', 'a');
    setState('permissions', [permission('a')]);
    setOpenSessionTabsForTest(['a']);

    cleanup = render(() => <SessionTabs onCreateSession={() => {}} />, container);

    expect(container.querySelector('.session-tab-dot.is-awaiting')).toBeInstanceOf(HTMLElement);
  });

  it('shows the awaiting dot when a session has a pending question', () => {
    setSessions([session('a', 3)]);
    setState('activeSessionId', 'a');
    setState('questions', [{ id: 'question-1', sessionID: 'a', questions: [] }]);
    setOpenSessionTabsForTest(['a']);

    cleanup = render(() => <SessionTabs onCreateSession={() => {}} />, container);

    expect(container.querySelector('.session-tab-dot.is-awaiting')).toBeInstanceOf(HTMLElement);
  });

  it('prefers the awaiting dot over running while input is required', () => {
    setSessions([session('a', 3)]);
    setState('activeSessionId', 'a');
    setState('sessionStatus', 'a', { type: 'busy' });
    setState('permissions', [permission('a')]);
    setOpenSessionTabsForTest(['a']);

    cleanup = render(() => <SessionTabs onCreateSession={() => {}} />, container);

    expect(container.querySelector('.session-tab-dot.is-awaiting')).toBeInstanceOf(HTMLElement);
    expect(container.querySelector('.session-tab-dot.is-running')).toBeNull();
  });

  it('shows the idle dot once generation has finished', () => {
    setSessions([session('a', 3)]);
    setState('activeSessionId', 'a');
    setOpenSessionTabsForTest(['a']);

    cleanup = render(() => <SessionTabs onCreateSession={() => {}} />, container);

    expect(container.querySelector('.session-tab-dot.is-idle')).toBeInstanceOf(HTMLElement);
  });

  it('shows the failed dot for a failed session', () => {
    setSessions([session('a', 3)]);
    setState('activeSessionId', 'a');
    setState('failedSessionIds', ['a']);
    setOpenSessionTabsForTest(['a']);

    cleanup = render(() => <SessionTabs onCreateSession={() => {}} />, container);

    expect(container.querySelector('.session-tab-dot.is-failed')).toBeInstanceOf(HTMLElement);
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

  function openTabMenu(tab: HTMLElement): HTMLDivElement {
    const notCanceled = tab.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 12, clientY: 24 })
    );
    expect(notCanceled).toBe(false);
    const menu = document.querySelector<HTMLDivElement>('.session-item-actions-menu');
    expect(menu).toBeInstanceOf(HTMLDivElement);
    return menu!;
  }

  function menuItem(menu: HTMLElement, label: string): HTMLButtonElement {
    const item = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (entry) => entry.textContent === label
    );
    expect(item, `missing menu item: ${label}`).toBeInstanceOf(HTMLButtonElement);
    return item!;
  }

  it('opens a browser-style tab context menu on right-click', () => {
    setSessions([session('a', 3), session('b', 2), session('c', 1)]);
    setState('activeSessionId', 'a');
    setOpenSessionTabsForTest(['a', 'b', 'c']);

    cleanup = render(() => <SessionTabs onCreateSession={() => {}} />, container);

    const menu = openTabMenu(container.querySelectorAll<HTMLElement>('.session-tab')[1]!);

    expect([...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent)).toEqual(
      ['Close tab', 'Close other tabs', 'Close tabs to the right']
    );
  });

  it('closes other tabs and switches to the kept tab', () => {
    setSessions([session('a', 3), session('b', 2), session('c', 1)]);
    setState('activeSessionId', 'a');
    setOpenSessionTabsForTest(['a', 'b', 'c']);

    cleanup = render(() => <SessionTabs onCreateSession={() => {}} />, container);

    const menu = openTabMenu(container.querySelectorAll<HTMLElement>('.session-tab')[1]!);
    menuItem(menu, 'Close other tabs').click();

    expect(getOpenSessionTabs()).toEqual(['b']);
    expect(selectSession).toHaveBeenCalledWith('b', { directory: '/repo/b' });
  });

  it('closes tabs to the right of the target without switching', () => {
    setSessions([session('a', 3), session('b', 2), session('c', 1)]);
    setState('activeSessionId', 'a');
    setOpenSessionTabsForTest(['a', 'b', 'c']);

    cleanup = render(() => <SessionTabs onCreateSession={() => {}} />, container);

    const menu = openTabMenu(container.querySelectorAll<HTMLElement>('.session-tab')[0]!);
    menuItem(menu, 'Close tabs to the right').click();

    expect(getOpenSessionTabs()).toEqual(['a']);
    expect(selectSession).not.toHaveBeenCalled();
  });

  it('disables closing tabs to the right when the target is the last tab', () => {
    setSessions([session('a', 3), session('b', 2)]);
    setState('activeSessionId', 'a');
    setOpenSessionTabsForTest(['a', 'b']);

    cleanup = render(() => <SessionTabs onCreateSession={() => {}} />, container);

    const menu = openTabMenu(container.querySelectorAll<HTMLElement>('.session-tab')[1]!);

    expect(menuItem(menu, 'Close tabs to the right').disabled).toBe(true);
  });
});
