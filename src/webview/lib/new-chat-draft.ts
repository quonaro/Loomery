import { batch } from 'solid-js';
import { getDefaultPrimaryAgentName } from '../hooks/routing-state';
import {
  clearMessages,
  inputText,
  isSessionAwaitingInput,
  persistActiveSessionId,
  requestComposerFocus,
  restoreSelectedModelForComposer,
  setError,
  setInputText,
  setPersistentShowSessionPicker,
  setSelectedAgent,
  setShowModelPicker,
  setShowModels,
  setState,
  showSessionPicker,
  state,
  stopLoading,
} from './state';
import { readWebviewInstanceContext } from './state-stored-values';
import { isEmptySession } from './empty-session';
import { resetMessageEditState } from './message-edit-state';
import { NEW_SESSION_TAB_ID, openSessionTab } from './session-tabs';
import { resetToolCallExpansionState } from './tool-call-expansion-state';

let newChatDraftGeneration = 0;

export function getNewChatDraftGeneration() {
  return newChatDraftGeneration;
}

export function getDiscardableActiveBlankSessionId(): string | false {
  const sessionId = state.activeSessionId;
  if (!sessionId || state.messagesLoading || state.messages.length > 0) return false;
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session || !isEmptySession(session)) return false;
  if (state.queuedMessages.some((item) => item.sessionId === sessionId)) return false;
  if (isSessionAwaitingInput(sessionId)) return false;
  const statusType = state.sessionStatus[sessionId]?.type;
  return statusType !== 'busy' && statusType !== 'retry' ? sessionId : false;
}

export function detachDiscardableActiveBlankSession(): string | false {
  const sessionId = getDiscardableActiveBlankSessionId();
  if (!sessionId) return false;

  newChatDraftGeneration += 1;
  batch(() => {
    setState('activeSessionId', null);
    persistActiveSessionId(null);
  });
  return sessionId;
}

/**
 * Switches the UI to a blank "New Chat" draft. The caller creates a real
 * session for it immediately (see the runtime's `startNewSession`); until that
 * resolves the synthetic draft tab stands in. Each call produces a fresh draft
 * instead of reusing an existing blank session, so any number of empty sessions
 * can be opened.
 */
export function startNewChatDraft() {
  newChatDraftGeneration += 1;
  const draftGeneration = newChatDraftGeneration;
  const deferTranscriptClear = state.messages.length > 0;
  const craftedText = inputText();
  batch(() => {
    resetMessageEditState();
    setInputText(craftedText);
    resetToolCallExpansionState();
    // Detach first so a live virtualized transcript can unmount before its
    // backing entries disappear. Clearing both in one reactive flush can leave
    // rows and streaming effects reading entries that were just removed.
    if (!deferTranscriptClear) clearMessages();
    setState('messagesLoading', false);
    setState('pendingSessionSelectionId', null);
    setState('activeSessionId', null);
    persistActiveSessionId(null);
    // Surface the draft as a tab immediately; it is replaced by the real
    // session tab once the created session becomes active.
    openSessionTab(NEW_SESSION_TAB_ID);
    setError(null);
    setShowModels(false);
    setShowModelPicker(false);
    stopLoading();
    // Creating a session from the open sessions list keeps that list visible;
    // only the Open Sessions control closes it. The editor surface still
    // switches away so its composer tracks the new draft.
    if (!(showSessionPicker() && readWebviewInstanceContext()?.surface !== 'editor')) {
      setPersistentShowSessionPicker(false);
    }
    restoreSelectedModelForComposer(null);
    setSelectedAgent(getDefaultPrimaryAgentName(state.agents), {
      sessionId: null,
      persistGlobal: false,
    });
    requestComposerFocus();
  });

  if (deferTranscriptClear) {
    requestAnimationFrame(() => {
      setTimeout(() => {
        // A selection, send, or another New Chat now owns the transcript.
        if (newChatDraftGeneration !== draftGeneration || state.activeSessionId) return;
        clearMessages();
      }, 0);
    });
  }
}
