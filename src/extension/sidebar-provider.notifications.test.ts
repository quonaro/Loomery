/* oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion -- Tests feed server events into the real provider-owned state manager without starting a server. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionStateManager } from './session-state-manager';
import { AUTO_APPROVE_JUDGE_TIMEOUT_MS } from '../shared/protocol';
import type { ServerEvent } from '../shared/protocol';
import {
  attachTestView,
  createSidebarProviderInstance,
  createWorkspaceState,
  getVscodeMock,
} from './sidebar-provider.test-support';

async function createHarness(enabled = true) {
  const { NativeNotifications } = await import('./native-notifications');
  const show = vi.spyOn(NativeNotifications.prototype, 'show').mockResolvedValue();
  const sound = vi.spyOn(NativeNotifications.prototype, 'playSound').mockResolvedValue();
  const editorVisible = vi
    .spyOn(NativeNotifications.prototype, 'isEditorVisible')
    .mockResolvedValue(false);
  const vscode = getVscodeMock();
  vscode.window.state.focused = false;
  const config = vscode.workspace.getConfiguration('loomery.notifications');
  await config.update('native', enabled);
  await config.update('sound', enabled);
  const values = new Map<string, unknown>();
  const globalState = createWorkspaceState();
  globalState.get.mockImplementation((key, fallback) => values.get(key) ?? fallback);
  globalState.update.mockImplementation(async (key, value) => {
    values.set(key, value);
  });
  const { provider, contextProvider } = await createSidebarProviderInstance({ globalState });
  const { view } = attachTestView(provider);
  await provider.handleMessage({ type: 'ready' });
  await provider.handleMessage({
    type: 'commands/state',
    payload: { canAbort: false, canSwitchSessions: false, model: null, sessionId: 'root' },
  });
  const state = (provider as unknown as { sessionState: SessionStateManager }).sessionState;
  state.handleServerEvent({
    type: 'session.updated',
    properties: { info: { id: 'root', title: 'Root conversation', directory: '/repo' } },
  });
  state.handleServerEvent({
    type: 'session.updated',
    properties: { info: { id: 'child', parentID: 'root', directory: '/repo' } },
  });
  vi.useFakeTimers();
  return {
    provider,
    contextProvider,
    state,
    view,
    show,
    sound,
    editorVisible,
    vscode,
    globalState,
  };
}

describe('SidebarProvider desktop notifications', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    getVscodeMock().env.remoteName = undefined;
    getVscodeMock().workspace.workspaceFile = undefined;
  });

  it('uses the workspace folder display name as the project name', async () => {
    const test = await createHarness();
    try {
      test.contextProvider.context.workspaceFolders = [{ name: 'Friendly project', path: '/repo' }];
      test.vscode.workspace.workspaceFolders = [
        { name: 'Friendly project', uri: { fsPath: '/repo' }, index: 0 },
      ];
      test.state.markSessionBusy('root');
      test.state.handleServerEvent({ type: 'session.idle', properties: { sessionID: 'root' } });
      await vi.advanceTimersByTimeAsync(300);
      expect(test.show).toHaveBeenCalledWith({
        projectName: 'Project: Friendly project',
        chatTitle: 'Root conversation',
        message: 'Response ready',
        sessionID: 'root',
      });
    } finally {
      await test.provider.dispose();
    }
  });

  it('targets the project window through the built-in file route', async () => {
    const test = await createHarness();
    try {
      const provider = test.provider as unknown as {
        notificationWindowUrl(): Promise<string>;
      };
      const url = new URL(await provider.notificationWindowUrl());
      expect(url.protocol).toBe('vscode:');
      expect(url.hostname).toBe('file');
      expect(url.pathname).toBe('/repo');
      expect(url.search).toBe('');
      expect(test.vscode.env.asExternalUri).not.toHaveBeenCalled();
    } finally {
      await test.provider.dispose();
    }
  });

  it('targets the saved multi-root workspace instead of a session folder', async () => {
    const test = await createHarness();
    try {
      test.vscode.workspace.workspaceFile = {
        scheme: 'file',
        path: '/work/Projects.code-workspace',
      };
      const provider = test.provider as unknown as { notificationWindowUrl(): Promise<string> };
      expect(await provider.notificationWindowUrl()).toBe(
        'vscode://file/work/Projects.code-workspace'
      );
    } finally {
      await test.provider.dispose();
    }
  });

  it('opens a notification chat in the sidebar and ignores unrelated or out-of-workspace links', async () => {
    const test = await createHarness();
    try {
      const open = vi.spyOn(test.provider, 'openSessionInSidebar').mockResolvedValue();
      const handler = test.vscode.window.registerUriHandler.mock.calls.at(-1)?.[0];
      if (!handler) throw new Error('Missing notification URI handler');
      const uri = {
        authority: 'quonaro.loomery',
        path: '/notification',
        query: 'session=child&root=root&directory=%2Frepo',
      };
      await handler.handleUri(uri as never);
      expect(open).toHaveBeenCalledExactlyOnceWith('child', '/repo');
      await handler.handleUri({ ...uri, path: '/another-action' } as never);
      await handler.handleUri({ ...uri, query: 'session=%00bad' } as never);
      expect(open).toHaveBeenCalledOnce();
      test.contextProvider.getOpenWorkspaceRoot.mockReturnValue(null);
      await handler.handleUri(uri as never);
      expect(open).toHaveBeenCalledOnce();
      expect(test.vscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('workspace folder is not open')
      );
    } finally {
      await test.provider.dispose();
    }
  });

  it.each([
    { windowFocused: true, chatFocused: true, visible: true, editorVisible: true, notify: false },
    { windowFocused: true, chatFocused: false, visible: true, editorVisible: true, notify: false },
    { windowFocused: false, chatFocused: true, visible: true, editorVisible: false, notify: true },
    {
      windowFocused: false,
      chatFocused: false,
      visible: false,
      editorVisible: false,
      notify: true,
    },
    { windowFocused: true, chatFocused: true, visible: false, editorVisible: false, notify: false },
    { windowFocused: false, chatFocused: false, visible: true, editorVisible: true, notify: false },
    {
      windowFocused: false,
      chatFocused: false,
      visible: false,
      editorVisible: true,
      notify: false,
    },
  ])('uses editor visibility independently of chat focus: %o', async (scenario) => {
    const test = await createHarness();
    try {
      test.vscode.window.state.focused = scenario.windowFocused;
      test.editorVisible.mockResolvedValue(scenario.editorVisible);
      test.view.visible = scenario.visible;
      await test.provider.handleMessage({
        type: 'webview/focus',
        payload: { focused: scenario.chatFocused },
      });
      test.state.handleServerEvent({
        type: 'question.asked',
        properties: { id: 'question', sessionID: 'child', questions: [] },
      });
      await vi.advanceTimersByTimeAsync(300);
      expect(test.show).toHaveBeenCalledTimes(Number(scenario.notify));
      expect(test.sound).toHaveBeenCalledTimes(Number(scenario.notify));
    } finally {
      await test.provider.dispose();
    }
  });

  it('keeps other sessions quiet while the VS Code window is focused', async () => {
    const test = await createHarness();
    try {
      test.vscode.window.state.focused = true;
      await test.provider.handleMessage({ type: 'webview/focus', payload: { focused: true } });
      test.state.handleServerEvent({
        type: 'question.asked',
        properties: { id: 'question', sessionID: 'other', questions: [] },
      });
      await vi.advanceTimersByTimeAsync(300);
      expect(test.show).not.toHaveBeenCalled();
    } finally {
      await test.provider.dispose();
    }
  });

  it.each([
    { setting: 'permission', kind: 'permission' },
    { setting: 'question', kind: 'question' },
    { setting: 'completed', kind: 'completed' },
    { setting: 'planReady', kind: 'plan-ready' },
  ] as const)(
    'applies the $setting checkbox independently of OS banners',
    async ({ setting, kind }) => {
      const test = await createHarness();
      try {
        const sound = { permission: true, question: true, completed: true, planReady: true };
        sound[setting] = false;
        await test.vscode.workspace
          .getConfiguration('loomery.notifications')
          .update('sound', sound);
        if (kind === 'permission') {
          test.state.handleServerEvent({
            type: 'permission.asked',
            properties: { id: 'permission', sessionID: 'child', permission: 'bash' },
          });
          test.state.revealPermission('permission');
        } else if (kind === 'question') {
          test.state.handleServerEvent({
            type: 'question.asked',
            properties: { id: 'question', sessionID: 'child', questions: [] },
          });
        } else {
          if (kind === 'plan-ready') test.state.setSessionAgent('root', 'plan');
          test.state.markSessionBusy('root');
          test.state.handleServerEvent({ type: 'session.idle', properties: { sessionID: 'root' } });
        }
        await vi.advanceTimersByTimeAsync(300);
        expect(test.sound).not.toHaveBeenCalled();
        expect(test.show).toHaveBeenCalledOnce();
      } finally {
        await test.provider.dispose();
      }
    }
  );

  it('shows native delivery failures once while keeping sound working', async () => {
    const test = await createHarness();
    try {
      test.show.mockRejectedValue(new Error('Notification service unavailable.'));
      test.vscode.window.showWarningMessage.mockClear();
      for (const id of ['first', 'second']) {
        test.state.handleServerEvent({
          type: 'question.asked',
          properties: { id, sessionID: 'child', questions: [] },
        });
        await vi.advanceTimersByTimeAsync(5_000);
      }
      expect(test.sound).toHaveBeenCalledTimes(2);
      expect(test.vscode.window.showWarningMessage).toHaveBeenCalledExactlyOnceWith(
        'Loomery could not show a system notification: Notification service unavailable.',
        'Show Output'
      );
    } finally {
      await test.provider.dispose();
    }
  });

  it.each([
    { value: { question: true }, plays: true },
    { value: { permission: true }, plays: false },
    { value: {}, plays: false },
    { value: true, plays: true },
    { value: false, plays: false },
  ])('reads the single sound setting $value', async ({ value, plays }) => {
    const test = await createHarness();
    try {
      await test.vscode.workspace.getConfiguration('loomery.notifications').update('sound', value);
      test.state.handleServerEvent({
        type: 'question.asked',
        properties: { id: 'question', sessionID: 'child', questions: [] },
      });
      await vi.advanceTimersByTimeAsync(300);
      expect(test.sound).toHaveBeenCalledTimes(Number(plays));
      expect(test.show).toHaveBeenCalledOnce();
    } finally {
      await test.provider.dispose();
    }
  });

  it.each(['message.updated', 'session.next.step.ended'] as const)(
    'notifies for a completed reply through %s once the server is idle',
    async (type) => {
      const test = await createHarness();
      try {
        test.vscode.window.state.focused = false;
        await test.provider.handleMessage({ type: 'webview/focus', payload: { focused: true } });
        test.state.handleServerEvent({
          type: 'session.status',
          properties: { sessionID: 'root', status: { type: 'busy' } },
        });
        const terminal: ServerEvent =
          type === 'message.updated'
            ? {
                type,
                properties: {
                  info: {
                    id: 'reply',
                    sessionID: 'root',
                    role: 'assistant',
                    finish: 'stop',
                    time: { created: 1, completed: Date.now() },
                  },
                },
              }
            : {
                type,
                properties: {
                  sessionID: 'root',
                  assistantMessageID: 'reply',
                  finish: 'stop',
                  timestamp: Date.now(),
                },
              };
        test.state.handleServerEvent(terminal);
        await vi.advanceTimersByTimeAsync(300);
        expect(test.show).not.toHaveBeenCalled();
        test.state.handleServerEvent({
          type: 'session.status',
          properties: { sessionID: 'root', status: { type: 'idle' } },
        });
        test.state.handleServerEvent(terminal);
        test.state.handleServerEvent({ type: 'session.idle', properties: { sessionID: 'root' } });
        await vi.advanceTimersByTimeAsync(300);
        expect(test.show).toHaveBeenCalledExactlyOnceWith({
          projectName: 'Project: repo',
          chatTitle: 'Root conversation',
          message: 'Response ready',
          sessionID: 'root',
        });
        expect(test.sound).toHaveBeenCalledOnce();

        // A second user turn must have its own completion notification.
        test.state.markSessionBusy('root');
        test.state.handleServerEvent({ type: 'session.idle', properties: { sessionID: 'root' } });
        await vi.advanceTimersByTimeAsync(5_000);
        expect(test.show).toHaveBeenCalledTimes(2);
      } finally {
        await test.provider.dispose();
      }
    }
  );

  it('reports a completed plan as ready for review', async () => {
    const test = await createHarness();
    try {
      test.state.setSessionAgent('root', 'plan');
      test.state.markSessionBusy('root');
      test.state.handleServerEvent({ type: 'session.idle', properties: { sessionID: 'root' } });
      await vi.advanceTimersByTimeAsync(300);
      expect(test.show).toHaveBeenCalledExactlyOnceWith({
        projectName: 'Project: repo',
        chatTitle: 'Root conversation',
        message: 'Plan ready for review',
        sessionID: 'root',
      });
      expect(test.sound).toHaveBeenCalledOnce();
    } finally {
      await test.provider.dispose();
    }
  });

  it.each([
    'focused',
    'child',
    'cancelled',
    'failed',
    'continuing',
    'history',
    'disabled',
  ] as const)('does not emit a completion notification for %s', async (reason) => {
    const test = await createHarness(reason !== 'disabled');
    try {
      const sessionID = reason === 'child' ? 'child' : 'root';
      if (reason === 'focused') test.vscode.window.state.focused = true;
      if (reason === 'focused')
        await test.provider.handleMessage({ type: 'webview/focus', payload: { focused: true } });
      if (reason !== 'history') test.state.markSessionBusy(sessionID);
      if (reason === 'cancelled' || reason === 'failed') {
        test.state.handleServerEvent({
          type: 'session.error',
          properties: {
            sessionID,
            error: {
              name: reason === 'cancelled' ? 'MessageAbortedError' : 'UnknownError',
              data: { message: 'Stopped' },
            },
          },
        });
      } else if (reason === 'continuing') {
        test.state.handleServerEvent({
          type: 'session.next.step.ended',
          properties: { sessionID, finish: 'stop', executionContinues: true },
        });
      } else {
        test.state.handleServerEvent({ type: 'session.idle', properties: { sessionID } });
      }
      if (reason === 'history')
        test.state.setSessionUnreadState(sessionID, 'completed', true, '/repo', 2);
      await vi.advanceTimersByTimeAsync(300);
      expect(test.show).not.toHaveBeenCalled();
      expect(test.sound).not.toHaveBeenCalled();
    } finally {
      await test.provider.dispose();
    }
  });

  it.each(['new-turn', 'pending-child', 'seen-in-background'] as const)(
    'rechecks completion after %s without relying on unread markers',
    async (change) => {
      const test = await createHarness();
      try {
        test.vscode.window.state.focused = false;
        test.state.markSessionBusy('root');
        test.state.handleServerEvent({ type: 'session.idle', properties: { sessionID: 'root' } });
        if (change === 'new-turn') test.state.markSessionBusy('root');
        if (change === 'pending-child')
          test.state.handleServerEvent({
            type: 'permission.asked',
            properties: { id: 'late-permission', sessionID: 'child', permission: 'bash' },
          });
        if (change === 'seen-in-background') test.state.acknowledgeCompletedSession('root');
        await vi.advanceTimersByTimeAsync(300);
        expect(test.show).toHaveBeenCalledTimes(change === 'seen-in-background' ? 1 : 0);
        expect(test.sound).toHaveBeenCalledTimes(change === 'seen-in-background' ? 1 : 0);
      } finally {
        await test.provider.dispose();
      }
    }
  );

  it.each(['permission.asked', 'permission.v2.asked'] as const)(
    'keeps automatic %s quiet and notifies only after manual reveal',
    async (type) => {
      const test = await createHarness();
      const ask = (id: string): ServerEvent =>
        type === 'permission.asked'
          ? { type, properties: { id, sessionID: 'child', permission: 'bash' } }
          : { type, properties: { id, sessionID: 'child', action: 'bash', resources: ['*'] } };
      try {
        test.state.handleServerEvent(ask('auto'));
        await vi.advanceTimersByTimeAsync(300);
        expect(test.show).not.toHaveBeenCalled();
        test.state.handleServerEvent(
          type === 'permission.asked'
            ? { type: 'permission.replied', properties: { requestID: 'auto', sessionID: 'child' } }
            : {
                type: 'permission.v2.replied',
                properties: { requestID: 'auto', sessionID: 'child', reply: { type: 'once' } },
              }
        );
        await vi.advanceTimersByTimeAsync(AUTO_APPROVE_JUDGE_TIMEOUT_MS);
        expect(test.sound).not.toHaveBeenCalled();
        test.state.handleServerEvent(ask('manual'));
        test.state.revealPermission('manual');
        await vi.advanceTimersByTimeAsync(300);
        expect(test.show).toHaveBeenCalledOnce();
        expect(test.sound).toHaveBeenCalledOnce();
      } finally {
        await test.provider.dispose();
      }
    }
  );

  it('notifies after the judge timeout without any webview reveal', async () => {
    const test = await createHarness();
    try {
      test.view.visible = false;
      test.state.handleServerEvent({
        type: 'permission.asked',
        properties: { id: 'timeout', sessionID: 'child', permission: 'bash' },
      });
      await vi.advanceTimersByTimeAsync(AUTO_APPROVE_JUDGE_TIMEOUT_MS + 300);
      expect(test.sound).toHaveBeenCalledOnce();
    } finally {
      await test.provider.dispose();
    }
  });

  it.each(['disabled', 'remote', 'other-workspace'] as const)(
    'does not deliver when %s',
    async (reason) => {
      const test = await createHarness(reason !== 'disabled');
      try {
        if (reason === 'remote') test.vscode.env.remoteName = 'ssh-remote';
        test.state.handleServerEvent({
          type: 'question.asked',
          workspaceDirectory: reason === 'other-workspace' ? '/other' : '/repo',
          properties: { id: 'question', sessionID: 'other', questions: [] },
        });
        await vi.advanceTimersByTimeAsync(300);
        expect(test.show).not.toHaveBeenCalled();
        expect(test.sound).not.toHaveBeenCalled();
      } finally {
        await test.provider.dispose();
      }
    }
  );
});
