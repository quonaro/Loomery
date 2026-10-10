// @ts-check
// Best-effort `pre-commit install` for the npm `prepare` hook.
// Never fails `npm install` when pre-commit is missing or installation fails.
import { spawnSync } from 'node:child_process';

function tryInstall(args, label) {
  try {
    const result = spawnSync('pre-commit', args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (result.error) {
      // oxlint-disable-next-line no-console
      console.warn(`[prepare] skipped ${label}: ${result.error.message}`);
      return;
    }
    if (result.status !== 0) {
      // oxlint-disable-next-line no-console
      console.warn(`[prepare] pre-commit ${args.join(' ')} exited with code ${String(result.status)}; skipping.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // oxlint-disable-next-line no-console
    console.warn(`[prepare] skipped ${label}: ${message}`);
  }
}

tryInstall(['install'], 'pre-commit install');
tryInstall(['install', '-t', 'pre-push'], 'pre-commit pre-push install');
