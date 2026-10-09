import { For, createEffect, createMemo, untrack } from 'solid-js';
import { selectSession } from '../../hooks/useOpenCode';
import { isPlaceholderSessionTitle, normalizeSessionTitle } from '../../../shared/session-title';
import { isSessionUnread, state } from '../../lib/state';
import {
  NEW_SESSION_TAB_ID,
  closeSessionTab,
  getOpenSessionTabs,
  openSessionTab,
  reorderSessionTabs,
} from '../../lib/session-tabs';
import { xmarkIcon } from '../../lib/ui-icons';
import { UiIcon } from '../UiIcon';
import { NewChatButton } from './ChatHeader';

type TabStatusKind = 'failed' | 'running' | 'unread' | 'idle';

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

  // Keep whatever session is active visible in the strip and retire the draft
  // tab once a real session takes over. The writes are untracked so closing the
  // active tab does not immediately reopen it when the tab list changes before
  // the session switch lands.
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
    const type = state.sessionStatus[id]?.type;
    if (type === 'busy' || type === 'retry') return 'running';
    const session = sessionsById().get(id);
    if (session && isSessionUnread(id, session.time.updated)) return 'unread';
    return 'idle';
  };

  const statusLabel = (kind: TabStatusKind) => {
    switch (kind) {
      case 'failed':
        return 'Failed';
      case 'running':
        return 'Running';
      case 'unread':
        return 'New activity';
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
              onAuxClick={(event) => {
                if (event.button === 1) close(id);
              }}
              onDragStart={(event) => onDragStart(event, id)}
              onDragOver={(event) => onDragOver(event, id)}
              onDrop={(event) => onDrop(event, id)}
            >
              <span class={`session-tab-dot is-${kind()}`} aria-hidden="true" />
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
    </div>
  );
}
