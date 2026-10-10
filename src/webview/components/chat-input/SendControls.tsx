import { Show } from 'solid-js';
import { Tooltip } from '../Tooltip';

function SendIcon(props: { size: number }) {
  return (
    <svg width={props.size} height={props.size} viewBox="0 0 32 32" fill="currentColor">
      <polygon
        points="15.707,3.293 14.293,4.707 24.586,15 4,15 4,17 24.586,17 14.293,27.293 15.707,28.707 28.414,16"
        transform="rotate(-90 16 16)"
      />
    </svg>
  );
}

export function SendControls(props: {
  showBusyControls: boolean;
  canSend: boolean;
  onSend: () => void;
}) {
  return (
    <Show
      when={props.showBusyControls}
      fallback={
        <Tooltip content="Send (Enter)">
          <button
            class={`chat-send-button ${props.canSend ? 'enabled' : 'disabled'}`}
            onClick={() => props.canSend && props.onSend()}
            disabled={!props.canSend}
            aria-label="Send (Enter)"
          >
            <SendIcon size={14} />
          </button>
        </Tooltip>
      }
    >
      <Tooltip content="Add to queue (Enter)">
        <button
          class="chat-send-button enabled"
          onClick={props.onSend}
          aria-label="Add to queue (Enter)"
        >
          <SendIcon size={14} />
        </button>
      </Tooltip>
    </Show>
  );
}
