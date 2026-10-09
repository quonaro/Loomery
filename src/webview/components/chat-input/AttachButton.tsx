import { plusIcon } from '../../lib/ui-icons';
import { Tooltip } from '../Tooltip';
import { UiIcon } from '../UiIcon';

export function AttachButton(props: { onAttach: () => void }) {
  return (
    <Tooltip content="Attach files">
      <button class="toolbar-attach-button" onClick={props.onAttach} aria-label="Attach files">
        <UiIcon source={plusIcon} width={16} height={16} />
      </button>
    </Tooltip>
  );
}
