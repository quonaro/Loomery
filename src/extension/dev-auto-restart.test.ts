/* oxlint-disable anti-slop/no-module-mocking -- These tests verify the development-only extension host restart watcher. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';

type WatcherListener = () => void;
type WatchPattern = { pattern: string };
type ListenerBuckets = {
  create: WatcherListener[];
  change: WatcherListener[];
  delete: WatcherListener[];
};

const {
  executeCommandMock,
  loggerMock,
  watcherMock,
  watcherListeners,
  createdPatterns,
  vscodeMock,
} = vi.hoisted(() => {
  const listeners: ListenerBuckets = { create: [], change: [], delete: [] };
  const watcher = {
    onDidCreate: vi.fn((listener: WatcherListener) => {
      listeners.create.push(listener);
      return { dispose: vi.fn() };
    }),
    onDidChange: vi.fn((listener: WatcherListener) => {
      listeners.change.push(listener);
      return { dispose: vi.fn() };
    }),
    onDidDelete: vi.fn((listener: WatcherListener) => {
      listeners.delete.push(listener);
      return { dispose: vi.fn() };
    }),
    dispose: vi.fn(),
  };
  const patterns: WatchPattern[] = [];
  const commandMock = vi.fn(() => Promise.resolve());
  return {
    executeCommandMock: commandMock,
    loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    watcherMock: watcher,
    watcherListeners: listeners,
    createdPatterns: patterns,
    vscodeMock: {
      ExtensionMode: { Production: 1, Development: 2, Test: 3 },
      RelativePattern: class RelativePattern {
        constructor(
          public readonly base: { fsPath: string },
          public readonly pattern: string
        ) {}
      },
      Uri: { file: vi.fn((fsPath: string) => ({ fsPath })) },
      workspace: {
        createFileSystemWatcher: vi.fn((pattern: WatchPattern) => {
          patterns.push(pattern);
          return watcher;
        }),
      },
      commands: { executeCommand: commandMock },
      Disposable: {
        from: vi.fn((...disposables: Array<{ dispose: () => void }>) => ({
          dispose: () => {
            for (const disposable of disposables) disposable.dispose();
          },
        })),
      },
    },
  };
});

vi.mock('vscode', () => vscodeMock);
vi.mock('./logger', () => ({ logger: loggerMock }));

import { startDevAutoRestart } from './dev-auto-restart';

const DEVELOPMENT_MODE = 2;
const RESTART_DEBOUNCE_MS = 400;

function createContext(): vscode.ExtensionContext {
  // SAFETY: startDevAutoRestart only reads extensionMode and extensionPath from the context.
  return {
    extensionMode: DEVELOPMENT_MODE,
    extensionPath: '/extension',
  } as vscode.ExtensionContext;
}

function fireWatcherEvent(kind: 'create' | 'change' | 'delete' = 'change') {
  for (const listener of watcherListeners[kind]) listener();
}

describe('startDevAutoRestart', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    watcherListeners.create.length = 0;
    watcherListeners.change.length = 0;
    watcherListeners.delete.length = 0;
    createdPatterns.length = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('stays off outside the development host', () => {
    const context = { ...createContext(), extensionMode: vscodeMock.ExtensionMode.Production };

    expect(startDevAutoRestart(context)).toBeUndefined();
    expect(vscodeMock.workspace.createFileSystemWatcher).not.toHaveBeenCalled();
  });

  it('stays off in the AI and sandbox test hosts', () => {
    vi.stubEnv('LOOMERY_TEST_SERVER_URL', 'http://127.0.0.1:49999');
    expect(startDevAutoRestart(createContext())).toBeUndefined();

    vi.unstubAllEnvs();
    vi.stubEnv('LOOMERY_SANDBOX_SCENARIO', 'healthy');
    expect(startDevAutoRestart(createContext())).toBeUndefined();

    expect(vscodeMock.workspace.createFileSystemWatcher).not.toHaveBeenCalled();
  });

  it('watches the build output and restarts the host after a change settles', async () => {
    const disposable = startDevAutoRestart(createContext());

    expect(disposable).toBeDefined();
    expect(vscodeMock.Uri.file).toHaveBeenCalledWith('/extension');
    expect(createdPatterns.map((created) => created.pattern)).toEqual(['dist/**/*']);
    expect(watcherMock.onDidChange).toHaveBeenCalledOnce();
    expect(watcherMock.onDidCreate).toHaveBeenCalledOnce();
    expect(watcherMock.onDidDelete).toHaveBeenCalledOnce();

    fireWatcherEvent('change');
    expect(executeCommandMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(RESTART_DEBOUNCE_MS);

    expect(executeCommandMock).toHaveBeenCalledExactlyOnceWith(
      'workbench.action.restartExtensionHost'
    );
  });

  it('coalesces a rebuild burst into a single restart', async () => {
    startDevAutoRestart(createContext());

    fireWatcherEvent('change');
    await vi.advanceTimersByTimeAsync(100);
    fireWatcherEvent('create');
    await vi.advanceTimersByTimeAsync(100);
    fireWatcherEvent('change');
    await vi.advanceTimersByTimeAsync(RESTART_DEBOUNCE_MS);

    expect(executeCommandMock).toHaveBeenCalledExactlyOnceWith(
      'workbench.action.restartExtensionHost'
    );
  });

  it('cancels a pending restart and disposes the watcher', async () => {
    const disposable = startDevAutoRestart(createContext());
    fireWatcherEvent('change');

    disposable?.dispose();
    await vi.advanceTimersByTimeAsync(RESTART_DEBOUNCE_MS * 2);

    expect(executeCommandMock).not.toHaveBeenCalled();
    expect(watcherMock.dispose).toHaveBeenCalledOnce();
  });

  it('logs a warning when the restart command rejects', async () => {
    executeCommandMock.mockRejectedValueOnce(new Error('restart unavailable'));
    startDevAutoRestart(createContext());

    fireWatcherEvent('change');
    await vi.advanceTimersByTimeAsync(RESTART_DEBOUNCE_MS);
    await Promise.resolve();

    expect(loggerMock.warn).toHaveBeenCalledWith(
      'Could not restart the extension host after a rebuild: restart unavailable'
    );
  });
});
