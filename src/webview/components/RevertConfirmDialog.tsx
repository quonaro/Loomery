import { Show, createResource, createSignal, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { FileDiff } from '../types';
import { client } from '../lib/client';
import { logError } from '../lib/log';
import { trapModalFocus } from '../lib/modal-focus';
import { state } from '../lib/state';
import { warningTriangleIcon, xmarkIcon } from '../lib/ui-icons';
import { DiffView } from './DiffView';
import { UiIcon } from './UiIcon';

/**
 * Confirmation for a message-level revert. Loads the workspace diff that the
 * revert would undo, lists it as per-file accordions, and only performs the
 * revert after the user confirms. The diff is read-only, so previewing never
 * mutates the session.
 */
export function RevertConfirmDialog(props: {
  sessionId: string;
  messageId: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const directory = () =>
    state.sessions.find((session) => session.id === props.sessionId)?.directory;
  const [diffs] = createResource<FileDiff[], { sessionId: string; messageId: string }>(
    () => ({ sessionId: props.sessionId, messageId: props.messageId }),
    (key) => client.session.diff(key.sessionId, key.messageId, { directory: directory() })
  );
  const [confirming, setConfirming] = createSignal(false);
  const files = () => diffs() ?? [];
  const totals = () =>
    files().reduce(
      (acc, diff) => ({ add: acc.add + diff.additions, del: acc.del + diff.deletions }),
      { add: 0, del: 0 }
    );

  const close = () => {
    if (confirming()) return;
    props.onCancel();
  };

  const confirm = () => {
    if (confirming()) return;
    setConfirming(true);
    void Promise.resolve(props.onConfirm())
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Promise rejection values have no typed contract.
      .catch((error: unknown) => {
        logError('revert-confirm:failed', error);
      })
      .finally(() => {
        setConfirming(false);
      });
  };

  return (
    <Portal>
      <div
        class="revert-confirm-overlay"
        onClick={close}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          close();
        }}
      >
        <div
          ref={(element) => onCleanup(trapModalFocus(element))}
          class="revert-confirm-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="revert-confirm-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header class="revert-confirm-header">
            <div>
              <div id="revert-confirm-title" class="revert-confirm-title">
                Revert to this message?
              </div>
              <div class="revert-confirm-subtitle">
                The workspace is restored to this checkpoint and this message plus everything after
                it is removed.
              </div>
            </div>
            <button
              type="button"
              class="revert-confirm-close"
              onClick={close}
              aria-label="Close"
              disabled={confirming()}
            >
              <UiIcon source={xmarkIcon} width={16} height={16} aria-hidden="true" />
            </button>
          </header>

          <div class="revert-confirm-body">
            <Show
              when={!diffs.loading}
              fallback={<div class="revert-confirm-empty">Loading changed files…</div>}
            >
              <Show
                when={files().length > 0}
                fallback={
                  <div class="revert-confirm-empty">
                    No file changes to restore. Later messages are still removed.
                  </div>
                }
              >
                <div class="revert-confirm-summary">
                  {files().length} file{files().length === 1 ? '' : 's'} changed ·{' '}
                  <span class="diff-lines-added">+{totals().add}</span>{' '}
                  <span class="diff-lines-removed">-{totals().del}</span>
                </div>
                <div class="revert-confirm-files">
                  <DiffView
                    diffs={files()}
                    showChanges
                    stateKey={`revert-confirm:${props.messageId}`}
                  />
                </div>
              </Show>
            </Show>

            <Show when={diffs.error}>
              <div class="revert-confirm-error" role="alert">
                <UiIcon source={warningTriangleIcon} width={13} height={13} aria-hidden="true" />
                <span>Could not load the changed files. You can still revert.</span>
              </div>
            </Show>
          </div>

          <footer class="revert-confirm-footer">
            <button
              type="button"
              class="revert-confirm-cancel"
              onClick={close}
              disabled={confirming()}
            >
              Cancel
            </button>
            <button
              type="button"
              class="revert-confirm-submit"
              onClick={confirm}
              disabled={confirming()}
            >
              {confirming() ? 'Reverting…' : 'Revert'}
            </button>
          </footer>
        </div>
      </div>
    </Portal>
  );
}
