import { For, Show, createEffect, createMemo, createSignal, onCleanup, untrack } from 'solid-js';
import { Portal } from 'solid-js/web';
import { selectSession } from '../../hooks/useOpenCode';
import { isPlaceholderSessionTitle, normalizeSessionTitle } from '../../../shared/session-title';
import { clampPopupToViewport } from '../../lib/popup-position';
import { getSessionTreeRootId, state } from '../../lib/state';
import {
  NEW_SESSION_TAB_ID,
  closeOtherSessionTabs,
  closeSessionTab,
  closeSessionTabsToTheRight,
  getOpenSessionTabs,
  openSessionTab,
  reorderSessionTabs,
} from '../../lib/session-tabs';
import {
  chatBubbleQuestionIcon,
  checkIcon,
  pauseSolidIcon,
  refreshIcon,
  xmarkCircleIcon,
  xmarkIcon,
} from '../../lib/ui-icons';
import { UiIcon } from '../UiIcon';
import { NewChatButton } from './ChatHeader';

type TabStatusKind = 'failed' | 'awaiting' | 'running' | 'paused' | 'idle';

const TAB_STATUS_ICON: Record<TabStatusKind, string> = {
  failed: xmarkCircleIcon,
  awaiting: chatBubbleQuestionIcon,
  running: refreshIcon,
  paused: pauseSolidIcon,
  idle: checkIcon,
};

const DRAG_MIME = 'text/loomery-session-tab';

/**
 * Horizontal strip of open sessions, styled after OmniACP's tab bar. Tabs are
 * the sessions the user has activated in this window; switching from anywhere
 * (session list, links, subagent navigation) opens or reuses a tab. The unsaved
 * New chat draft also shows up as a tab until its first message creates the
 * real session.
 */
export function SessionTabs(props: { onCreateSession: () => void }) {
  let draggedId: string | null = null;

  const sessionsById = createMemo(
    () => new Map(state.sessions.map((session) => [session.id, session]))
  );
  // Keep plain ids so `<For>` keeps each tab's DOM stable across updates.
  const tabs = createMemo(() => {
    const sessions = sessionsById();
    return getOpenSessionTabs().filter((id) => id === NEW_SESSION_TAB_ID || sessions.has(id));
  });

  // Sessions blocked on a user decision (permission request or question) get the
  // attention colour. Permissions/questions can belong to a child session, so
  // map each one back to its tab's root id as well.
  const awaitingSessionIds = createMemo(() => {
    const ids = new Set<string>();
    const add = (sessionId: string) => {
      ids.add(sessionId);
      ids.add(getSessionTreeRootId(sessionId) || sessionId);
    };
    for (const permission of state.permissions) add(permission.sessionID);
    for (const question of state.questions) add(question.sessionID);
    return ids;
  });

  // A paused queue entry means the user parked follow-up work for this session.
  // Surface it only while nothing else is happening (see `tabStatus`).
  const pausedSessionIds = createMemo(() => {
    const ids = new Set<string>();
    for (const queued of state.queuedMessages) {
      if (queued.paused !== true) continue;
      ids.add(queued.sessionId);
      ids.add(getSessionTreeRootId(queued.sessionId) || queued.sessionId);
    }
    return ids;
  });

  // Keep whatever session is active visible in the strip and retire the draft
  // tab once a real session takes over. Opening the sessions list does not clear
  // the active session, so this also surfaces a session the user opened from the
  // list (or one restored as active) as a tab. The writes are untracked so
  // closing the active tab does not immediately reopen it when the tab list
  // changes before the session switch lands.
  createEffect(() => {
    const active = state.activeSessionId;
    untrack(() => {
      if (!active) return;
      openSessionTab(active);
      closeSessionTab(NEW_SESSION_TAB_ID);
    });
  });

  const isDraftTab = (id: string) => id === NEW_SESSION_TAB_ID;

  const isTabActive = (id: string) =>
    isDraftTab(id) ? state.activeSessionId === null : state.activeSessionId === id;

  // A freshly created session has no real title yet, so its tab reads
  // "New Session" instead of the generic "New Chat"/"Untitled" fallbacks.
  const tabTitle = (id: string) => {
    if (isDraftTab(id)) return 'New Session';
    const title = sessionsById().get(id)?.title;
    return isPlaceholderSessionTitle(title) ? 'New Session' : normalizeSessionTitle(title);
  };

  const tabStatus = (id: string): TabStatusKind => {
    if (isDraftTab(id)) return 'idle';
    if (state.failedSessionIds.includes(id)) return 'failed';
    if (awaitingSessionIds().has(id)) return 'awaiting';
    const type = state.sessionStatus[id]?.type;
    if (type === 'busy' || type === 'retry') return 'running';
    if (pausedSessionIds().has(id)) return 'paused';
    return 'idle';
  };

  const statusLabel = (kind: TabStatusKind) => {
    switch (kind) {
      case 'failed':
        return 'Failed';
      case 'awaiting':
        return 'Waiting for input';
      case 'running':
        return 'Running';
      case 'paused':
        return 'Queue paused';
      default:
        return 'Idle';
    }
  };

  const activate = (id: string) => {
    if (isTabActive(id)) return;
    if (isDraftTab(id)) {
      props.onCreateSession();
      return;
    }
    const session = sessionsById().get(id);
    void selectSession(id, session ? { directory: session.directory } : undefined);
  };

  const close = (id: string) => {
    const wasActive = isTabActive(id);
    // Pick the neighbour from the tabs we actually render. The stored list can
    // still hold ids for sessions this server no longer knows (deleted, or from
    // another workspace), and selecting one of those fails with a hard
    // "conversation is unavailable" error.
    const visible = tabs();
    const index = visible.indexOf(id);
    const neighbor = index === -1 ? null : (visible[index + 1] ?? visible[index - 1] ?? null);
    closeSessionTab(id);
    if (wasActive && neighbor) activate(neighbor);
  };

  const activeTabId = () => state.activeSessionId ?? NEW_SESSION_TAB_ID;

  const [menuState, setMenuState] = createSignal<{ id: string; x: number; y: number } | null>(null);
  let menuRef: HTMLDivElement | undefined;

  const closeMenu = () => setMenuState(null);

  const openMenu = (event: MouseEvent, id: string) => {
    event.preventDefault();
    setMenuState({ id, x: event.clientX, y: event.clientY });
  };

  createEffect(() => {
    if (!menuState()) return;
    const closeIfOutside = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && menuRef?.contains(target)) return;
      closeMenu();
    };
    window.addEventListener('contextmenu', closeIfOutside, true);
    window.addEventListener('pointerdown', closeIfOutside, true);
    window.addEventListener('focusin', closeIfOutside);
    onCleanup(() => {
      window.removeEventListener('contextmenu', closeIfOutside, true);
      window.removeEventListener('pointerdown', closeIfOutside, true);
      window.removeEventListener('focusin', closeIfOutside);
    });
  });

  createEffect(() => {
    if (!menuState()) return;
    queueMicrotask(() => {
      if (!menuRef) return;
      clampPopupToViewport(menuRef);
      menuRef.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    });
  });

  const closeOtherTabs = (id: string) => {
    const closing = tabs().filter((tabId) => tabId !== id);
    closeOtherSessionTabs(id);
    if (closing.includes(activeTabId())) activate(id);
  };

  const closeTabsToTheRight = (id: string) => {
    const current = tabs();
    const index = current.indexOf(id);
    const closing = index === -1 ? [] : current.slice(index + 1);
    closeSessionTabsToTheRight(id);
    if (closing.includes(activeTabId())) activate(id);
  };

  const isLastVisibleTab = () => {
    const menu = menuState();
    if (!menu) return true;
    const current = tabs();
    return current.indexOf(menu.id) === current.length - 1;
  };

  const onDragStart = (event: DragEvent, id: string) => {
    draggedId = id;
    event.dataTransfer?.setData(DRAG_MIME, id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (event: DragEvent, id: string) => {
    if (draggedId && draggedId !== id) event.preventDefault();
  };

  const onDrop = (event: DragEvent, id: string) => {
    event.preventDefault();
    const source = event.dataTransfer?.getData(DRAG_MIME) || draggedId;
    draggedId = null;
    if (source && source !== id) reorderSessionTabs(source, id);
  };

  return (
    <div class="session-tabs" role="tablist" aria-label="Open sessions">
      <For each={tabs()}>
        {(id) => {
          const isActive = () => isTabActive(id);
          const kind = () => tabStatus(id);
          return (
            <div
              class={`session-tab${isActive() ? ' is-active' : ''}${isDraftTab(id) ? ' is-draft' : ''}`}
              role="tab"
              aria-selected={isActive()}
              title={`${tabTitle(id)} - ${statusLabel(kind())}`}
              draggable="true"
              onClick={() => activate(id)}
              onContextMenu={(event) => openMenu(event, id)}
              onAuxClick={(event) => {
                if (event.button === 1) close(id);
              }}
              onDragStart={(event) => onDragStart(event, id)}
              onDragOver={(event) => onDragOver(event, id)}
              onDrop={(event) => onDrop(event, id)}
            >
              <UiIcon
                source={TAB_STATUS_ICON[kind()]}
                class={`session-tab-dot is-${kind()}`}
                width={12}
                height={12}
                aria-hidden="true"
              />
              <span class="session-tab-title">{tabTitle(id)}</span>
              <button
                type="button"
                class="session-tab-close"
                title="Close session"
                aria-label="Close session"
                onClick={(event) => {
                  event.stopPropagation();
                  close(id);
                }}
              >
                <UiIcon source={xmarkIcon} width={12} height={12} />
              </button>
            </div>
          );
        }}
      </For>
      <div class="session-tabs-new">
        <NewChatButton onCreateSession={props.onCreateSession} />
      </div>
      <Show when={menuState()}>
        {(menu) => (
          <Portal>
            <div
              ref={(element) => {
                menuRef = element;
              }}
              class="session-item-actions-menu"
              role="menu"
              aria-label="Session tab actions"
              style={{ left: `${menu().x}px`, top: `${menu().y}px` }}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                closeMenu();
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const id = menu().id;
                  closeMenu();
                  close(id);
                }}
              >
                Close tab
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const id = menu().id;
                  closeMenu();
                  closeOtherTabs(id);
                }}
              >
                Close other tabs
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={isLastVisibleTab()}
                onClick={() => {
                  const id = menu().id;
                  closeMenu();
                  closeTabsToTheRight(id);
                }}
              >
                Close tabs to the right
              </button>
            </div>
          </Portal>
        )}
      </Show>
    </div>
  );
}
