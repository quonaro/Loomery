import * as vscode from 'vscode';
import { logger } from './logger';

/** Wait for a rebuild burst to settle before restarting the host. */
const DEV_AUTO_RESTART_DEBOUNCE_MS = 400;

/**
 * Restarts the extension host whenever the development build output changes.
 *
 * VS Code has no built-in hot reload for extension development, so a development
 * host keeps running the bundle it loaded until the window is reloaded or the
 * host is restarted. Watching the built extension and webview output turns each
 * rebuild into that restart automatically.
 *
 * The watcher only starts when VS Code loads the extension from
 * `--extensionDevelopmentPath`. Installed extensions run in production mode and
 * are never reloaded this way, and the AI and sandbox harnesses keep their host
 * alive by marking themselves with their own environment variables.
 */
export function startDevAutoRestart(
  context: vscode.ExtensionContext
): vscode.Disposable | undefined {
  if (context.extensionMode !== vscode.ExtensionMode.Development) return undefined;
  if (process.env.LOOMERY_TEST_SERVER_URL || process.env.LOOMERY_SANDBOX_SCENARIO) return undefined;

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(vscode.Uri.file(context.extensionPath), 'dist/**/*')
  );
  let restartTimer: ReturnType<typeof setTimeout> | undefined;

  const scheduleRestart = () => {
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      restartTimer = undefined;
      logger.info('Build output changed; restarting the extension host');
      void (async () => {
        try {
          await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
        } catch (error) {
          logger.warn(
            `Could not restart the extension host after a rebuild: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      })();
    }, DEV_AUTO_RESTART_DEBOUNCE_MS);
  };

  const listeners = [
    watcher.onDidChange(scheduleRestart),
    watcher.onDidCreate(scheduleRestart),
    watcher.onDidDelete(scheduleRestart),
  ];
  logger.info('Watching the build output to restart the extension host after rebuilds');

  return vscode.Disposable.from(watcher, ...listeners, {
    dispose: () => {
      if (restartTimer) clearTimeout(restartTimer);
      restartTimer = undefined;
    },
  });
}
