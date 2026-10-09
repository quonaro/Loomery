import { Show, Suspense, createMemo, createSignal, lazy, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';
import { MessageList } from '../MessageList';
import { ChatInput } from '../ChatInput';
import { ActiveChatHeader, SessionPickerHeader } from './ChatHeader';
import { WindowChatThemeToggle } from './WindowChatThemeToggle';
import { SessionListView } from './SessionListView';
import { SessionTabs } from './SessionTabs';
import type { SessionIndicatorSets, SessionListFilter } from './SessionListView';
import type { SlowApiRequest } from '../../lib/bridge';
import { onMessage } from '../../lib/bridge';
import { editingMessage, inlineEditMount } from '../../lib/message-edit-state';
import { ralphStore } from '../../lib/stores/ralph-store';
import { state } from '../../lib/state';
import { ManagedSubagentFooter } from './ManagedSubagentFooter';

const LazyRalphDashboard = lazy(() =>
  import('../ralph/RalphDashboard').then((module) => ({ default: module.RalphDashboard }))
);
const LazyModelsPanel = lazy(() =>
  import('../ModelsPanel').then((module) => ({ default: module.ModelsPanel }))
);
const LazyPermissionSettingsPanel = lazy(() =>
  import('../PermissionSettingsPanel').then((module) => ({
    default: module.PermissionSettingsPanel,
  }))
);

function activeRalphSessionId() {
  const id = state.activeSessionId;
  return id && ralphStore.isRalphSession(id) ? id : null;
}

// Hosts the single live ChatInput. While a message is being edited the
// composer DOM relocates into the edited message row (the Portal moves the
// existing nodes - component state is preserved); otherwise it sits in the
// bottom slot.
function ComposerHost() {
  const [bottomMount, setBottomMount] = createSignal<HTMLElement | null>(null);
  const [parkingMount, setParkingMount] = createSignal<HTMLElement | null>(null);
  const mountTarget = () =>
    inlineEditMount() ?? (editingMessage() ? parkingMount() : bottomMount());

  return (
    <>
      <div class="composer-bottom-slot" ref={setBottomMount} />
      <div hidden ref={setParkingMount} />
      <Show when={!!mountTarget()}>
        <Portal
          mount={mountTarget()!}
          ref={(el) => {
            el.style.display = 'contents';
          }}
        >
          <ChatInput />
        </Portal>
      </Show>
    </>
  );
}

export function ChatWorkspace(props: {
  rawSessionIndicators: SessionIndicatorSets;
  shouldRenderWorkspace: boolean;
  isDesktopSessionPaneRight: boolean;
  showDesktopSessionPane: boolean;
  showSessionHeader: boolean;
  showSessionPicker: boolean;
  showModels: boolean;
  showPermissionSettings: boolean;
  showReconnectBanner: boolean;
  slowApiRequests: readonly SlowApiRequest[];
  sessionFilter: SessionListFilter | null;
  subagentParentId: string | null;
  sidebarSubagentParentId: string | null;
  sessionListFilterLabel: string | null;
  sessionListFilterPrefix: string;
  sessionListFilterTitle?: string;
  sidebarSessionListFilterLabel: string | null;
  sidebarSessionListFilterTitle?: string;
  primarySessionsCount: number;
  shouldShowFailedBadge: boolean;
  shouldShowAttentionBadge: boolean;
  shouldShowPlanReadyBadge: boolean;
  shouldShowCompletedBadge: boolean;
  shouldShowRunningBadge: boolean;
  shouldShowPendingBadge: boolean;
  failedSessionsCount: number;
  attentionSessionsCount: number;
  planReadySessionsCount: number;
  completedSessionsCount: number;
  runningSessionsCount: number;
  pendingSessionsCount: number;
  activePending: boolean;
  sessionSidebarFailedCount: number;
  sessionSidebarAttentionCount: number;
  sessionSidebarPlanReadyCount: number;
  sessionSidebarCompletedCount: number;
  sessionSidebarRunningCount: number;
  sessionSidebarPendingCount: number;
  activeTitle: string;
  activeBackTitle: string;
  showDesktopBackButton: boolean;
  activeSubagentRootId: string | null;
  activeSubagentCount: number;
  activeSubagentLabel: string;
  managedSubagentParentId: string | null;
  managedSubagentParentTitle: string | null;
  onOpenAllSessions: () => void;
  onReturnToManagedSubagentParent: () => void;
  onOpenSubagentSessions: (parentSessionId: string) => void;
  onOpenSidebarSubagentSessions: (parentSessionId: string) => void;
  onOpenTopLevelSidebarSessions: () => void;
  onOpenFailedSessions: () => void;
  onOpenAttentionSessions: () => void;
  onOpenPlanReadySessions: () => void;
  onOpenCompletedSessions: () => void;
  onOpenRunningSessions: () => void;
  onOpenPendingSessions: () => void;
  onSendFromPicker: () => void;
  onCreateSession: () => void;
}) {
  let chatContentRef: HTMLDivElement | undefined;
  const [visiblePrimarySessionsCount, setVisiblePrimarySessionsCount] = createSignal(
    props.primarySessionsCount
  );
  const [markAllRead, setMarkAllRead] = createSignal<(() => void) | null>(null);
  // Create this memo under the component owner, not in a JSX prop getter read by a click handler.
  const markAllReadAction = createMemo(() => (props.showSessionPicker ? markAllRead() : null));
  const updateMarkAllRead = (action: (() => void) | null) => setMarkAllRead(() => action);
  const showActiveSessionCue = () => {
    if (!chatContentRef) return;
    const header = chatContentRef.querySelector<HTMLElement>(':scope > .chat-header-chat-desktop');
    chatContentRef.style.setProperty('--chat-reselect-top', `${header?.offsetHeight ?? 0}px`);
    chatContentRef.classList.remove('active-session-reselected');
    void chatContentRef.offsetWidth;
    chatContentRef.classList.add('active-session-reselected');
  };
  onMount(() => {
    onCleanup(
      onMessage((message) => {
        if (message.type === 'command/highlight-session') showActiveSessionCue();
      })
    );
  });
  const sidebarSubagentParentId = () =>
    props.showSessionPicker ? props.subagentParentId : props.sidebarSubagentParentId;
  const sidebarFilterLabel = () =>
    props.showSessionPicker ? props.sessionListFilterLabel : props.sidebarSessionListFilterLabel;
  const sidebarFilterPrefix = () =>
    props.showSessionPicker ? props.sessionListFilterPrefix : 'Viewing:';
  const sidebarFilterTitle = () =>
    props.showSessionPicker ? props.sessionListFilterTitle : props.sidebarSessionListFilterTitle;
  const sessionPickerHeader = () => (
    <SessionPickerHeader
      filterLabel={sidebarFilterLabel()}
      filterPrefix={sidebarFilterPrefix()}
      filterTitle={sidebarFilterTitle()}
      primarySessionsCount={visiblePrimarySessionsCount()}
      showBackButton={!!sidebarSubagentParentId()}
      backTitle="Back to sessions"
      showFailedBadge={props.shouldShowFailedBadge}
      showAttentionBadge={props.shouldShowAttentionBadge}
      showPlanReadyBadge={props.shouldShowPlanReadyBadge}
      showCompletedBadge={props.shouldShowCompletedBadge}
      showRunningBadge={props.shouldShowRunningBadge}
      showPendingBadge={props.shouldShowPendingBadge}
      failedCount={props.sessionSidebarFailedCount}
      attentionCount={props.sessionSidebarAttentionCount}
      planReadyCount={props.sessionSidebarPlanReadyCount}
      completedCount={props.sessionSidebarCompletedCount}
      runningCount={props.sessionSidebarRunningCount}
      pendingCount={props.sessionSidebarPendingCount}
      showNewChatButton
      onMarkAllRead={markAllReadAction()}
      onBack={props.onOpenTopLevelSidebarSessions}
      onClearFilter={props.onOpenTopLevelSidebarSessions}
      onOpenFailedSessions={props.onOpenFailedSessions}
      onOpenAttentionSessions={props.onOpenAttentionSessions}
      onOpenPlanReadySessions={props.onOpenPlanReadySessions}
      onOpenCompletedSessions={props.onOpenCompletedSessions}
      onOpenRunningSessions={props.onOpenRunningSessions}
      onOpenPendingSessions={props.onOpenPendingSessions}
      onCreateSession={props.onCreateSession}
    />
  );

  const activeChatHeader = (showBackButton: boolean, showActions = true) => (
    <ActiveChatHeader
      title={props.activeTitle}
      showBackButton={showBackButton}
      backTitle={props.activeBackTitle}
      showActions={showActions}
      activeSubagentRootId={props.activeSubagentRootId}
      activeSubagentCount={props.activeSubagentCount}
      activeSubagentLabel={props.activeSubagentLabel}
      failedCount={props.failedSessionsCount}
      attentionCount={props.attentionSessionsCount}
      planReadyCount={props.planReadySessionsCount}
      completedCount={props.completedSessionsCount}
      runningCount={props.runningSessionsCount}
      pendingCount={props.pendingSessionsCount}
      activePending={props.activePending}
      onBack={props.onOpenAllSessions}
      onOpenSubagents={props.onOpenSubagentSessions}
      onOpenFailedSessions={props.onOpenFailedSessions}
      onOpenAttentionSessions={props.onOpenAttentionSessions}
      onOpenPlanReadySessions={props.onOpenPlanReadySessions}
      onOpenCompletedSessions={props.onOpenCompletedSessions}
      onOpenRunningSessions={props.onOpenRunningSessions}
      onOpenPendingSessions={props.onOpenPendingSessions}
    />
  );

  const sessionSidebar = () => (
    <aside class="chat-session-sidebar" aria-label="Sessions">
      <div class="chat-header chat-session-sidebar-header">
        <div class="chat-header-inner chat-session-sidebar-header-inner">
          {sessionPickerHeader()}
        </div>
      </div>
      <SessionListView
        rawSessionIndicators={props.rawSessionIndicators}
        embedded
        class="session-list-view-sidebar"
        sessionFilter={props.showSessionPicker ? props.sessionFilter : null}
        subagentParentId={sidebarSubagentParentId()}
        onOpenSubagents={props.onOpenSidebarSubagentSessions}
        onActiveSessionReselect={showActiveSessionCue}
        onPrimarySessionsCountChange={setVisiblePrimarySessionsCount}
        onMarkAllReadChange={updateMarkAllRead}
      />
    </aside>
  );

  const mainShell = () => (
    <div
      ref={(element) => {
        chatContentRef = element;
      }}
      class="chat-main-shell"
      onAnimationEnd={(event) => {
        if (
          event.target === event.currentTarget &&
          event.animationName === 'active-session-reselected'
        ) {
          event.currentTarget.classList.remove('active-session-reselected');
        }
      }}
    >
      <Show when={props.showSessionHeader}>
        <div class="chat-header chat-header-chat-desktop">
          <div class="chat-header-inner">
            {activeChatHeader(props.showDesktopBackButton, !props.showDesktopSessionPane)}
          </div>
        </div>
      </Show>
      <div class="chat-main-column-shell">
        <Show
          when={activeRalphSessionId()}
          fallback={
            <>
              <MessageList />
              <Show when={props.managedSubagentParentId} fallback={<ComposerHost />}>
                <ManagedSubagentFooter
                  parentTitle={props.managedSubagentParentTitle}
                  onReturnToParent={props.onReturnToManagedSubagentParent}
                />
              </Show>
            </>
          }
        >
          {(sessionId) => (
            <Suspense>
              <LazyRalphDashboard sessionId={sessionId()} />
            </Suspense>
          )}
        </Show>
      </div>
    </div>
  );

  return (
    <div
      class={`interactive-session${props.showModels ? ' interactive-session-showing-models' : ''}`}
    >
      <WindowChatThemeToggle />
      <SessionTabs onCreateSession={props.onCreateSession} />

      <Show when={props.showReconnectBanner}>
        <div
          class={`chat-transport-banner ${props.shouldRenderWorkspace ? 'chat-main-column' : ''}`}
          role="status"
          aria-live="polite"
        >
          <div class="chat-transport-copy">
            <span class="chat-transport-title">Live updates are reconnecting</span>
            <span class="chat-transport-message">
              Chat actions still work, but session status may lag until the event stream recovers.
            </span>
          </div>
        </div>
      </Show>

      <Show when={props.slowApiRequests.length > 0}>
        <div
          class={`chat-transport-banner chat-api-warning-banner ${props.shouldRenderWorkspace ? 'chat-main-column' : ''}`}
          role="status"
          aria-live="polite"
        >
          <div class="chat-transport-copy">
            <span class="chat-transport-title">Some requests are taking longer than expected</span>
            <span class="chat-transport-message">
              {props.slowApiRequests
                .slice(0, 3)
                .map((request) => `${request.method} ${request.path}`)
                .join(' · ')}
              {props.slowApiRequests.length > 3
                ? ` · ${props.slowApiRequests.length - 3} more`
                : ''}
            </span>
          </div>
        </div>
      </Show>

      <Show when={props.showModels}>
        <Suspense>
          <LazyModelsPanel />
        </Suspense>
      </Show>
      <Show when={props.showPermissionSettings}>
        <Suspense>
          <LazyPermissionSettingsPanel />
        </Suspense>
      </Show>

      <Show
        when={props.shouldRenderWorkspace}
        fallback={
          <>
            <SessionListView
              rawSessionIndicators={props.rawSessionIndicators}
              sessionFilter={props.sessionFilter}
              subagentParentId={props.subagentParentId}
              onOpenSubagents={props.onOpenSubagentSessions}
              onPrimarySessionsCountChange={setVisiblePrimarySessionsCount}
              onMarkAllReadChange={updateMarkAllRead}
            />
            <div class="session-list-new-session">
              <ChatInput newSession onBeforeSend={props.onSendFromPicker} />
            </div>
          </>
        }
      >
        <div
          class={`chat-workspace ${props.isDesktopSessionPaneRight ? 'chat-workspace-pane-right' : ''}`}
        >
          <Show when={props.showDesktopSessionPane} fallback={mainShell()}>
            <>
              {mainShell()}
              {sessionSidebar()}
            </>
          </Show>
        </div>
      </Show>
    </div>
  );
}
