import { createSignal } from 'solid-js';
import type { MessageEditContext } from './message-edit-state';

/**
 * A user message that a commit-revert removed. The composer restores it as a
 * draft so the prompt can be reviewed and resent, mirroring OpenCode's undo
 * flow: an empty composer receives the text and attachments, while an occupied
 * composer parks it as a paused queued message instead of overwriting the draft.
 */
export type RevertedMessageDraft = {
  sessionId: string;
  text: string;
  context: MessageEditContext;
};

const [revertedMessageDraft, setRevertedMessageDraft] = createSignal<RevertedMessageDraft | null>(
  null
);

export { revertedMessageDraft };

export function publishRevertedMessageDraft(draft: RevertedMessageDraft) {
  setRevertedMessageDraft(draft);
}

export function consumeRevertedMessageDraft(): RevertedMessageDraft | null {
  const draft = revertedMessageDraft();
  if (!draft) return null;
  setRevertedMessageDraft(null);
  return draft;
}
