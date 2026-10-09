import { createSignal, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import { trapModalFocus } from '../lib/modal-focus';
import { UiIcon } from './UiIcon';
import { xmarkIcon } from '../lib/ui-icons';

/**
 * Confirmation for irreversible single-message deletion. Unlike revert, only
 * this message is removed and workspace files are left untouched.
 */
export function DeleteMessageConfirmDialog(props: {
  role: 'user' | 'assistant';
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [confirming, setConfirming] = createSignal(false);

  const close = () => {
    if (confirming()) return;
    props.onCancel();
  };

  const confirm = () => {
    if (confirming()) return;
    setConfirming(true);
    void Promise.resolve(props.onConfirm()).finally(() => {
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
          aria-labelledby="delete-message-confirm-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header class="revert-confirm-header">
            <div>
              <div id="delete-message-confirm-title" class="revert-confirm-title">
                Delete this {props.role === 'user' ? 'message' : 'response'}?
              </div>
              <div class="revert-confirm-subtitle">
                Only this message is permanently removed. Files are not restored and this cannot be
                undone.
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
              {confirming() ? 'Deleting…' : 'Delete permanently'}
            </button>
          </footer>
        </div>
      </div>
    </Portal>
  );
}
