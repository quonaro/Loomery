import { createSignal, Show } from 'solid-js';

export function MissingDirectoryBanner(props: {
  sessionId: string;
  directory: string;
  onRelocate: (sessionId: string) => Promise<void>;
  onBack: () => void;
}) {
  const [relocating, setRelocating] = createSignal(false);
  const [relocateError, setRelocateError] = createSignal<string | null>(null);

  const relocate = async () => {
    if (relocating()) return;
    setRelocating(true);
    setRelocateError(null);
    try {
      await props.onRelocate(props.sessionId);
    } catch (err) {
      setRelocateError(err instanceof Error ? err.message : String(err));
    } finally {
      setRelocating(false);
    }
  };

  return (
    <div class="chat-transport-banner chat-readonly-banner" role="status" aria-live="polite">
      <div class="chat-transport-copy">
        <span class="chat-transport-title">
          <span class="session-readonly-badge">Read-only</span>
          <span>This folder no longer exists</span>
        </span>
        <span class="chat-transport-message" title={props.directory}>
          {props.directory} - showing the cached transcript. Sending is disabled.
        </span>
        <Show when={relocateError()}>
          {(message) => (
            <span class="chat-transport-message chat-readonly-error" role="alert">
              Relocation failed: {message()}
            </span>
          )}
        </Show>
        <span class="chat-readonly-actions">
          <button type="button" disabled={relocating()} onClick={() => void relocate()}>
            {relocating() ? 'Relocating…' : 'Relocate session'}
          </button>
          <button type="button" onClick={() => props.onBack()}>
            Back to sessions
          </button>
        </span>
      </div>
    </div>
  );
}
