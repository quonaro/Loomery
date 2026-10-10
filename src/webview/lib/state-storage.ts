import { BrowserPersistence } from './browser-persistence';

export const STORAGE_KEYS = {
  selectedAgent: 'loomery.selectedAgent',
  sessionSelectedAgents: 'loomery.sessionSelectedAgents',
  skippedPlanSessions: 'loomery.skippedPlanSessions',
  selectedModel: 'loomery.selectedModel',
  lastSelectedModel: 'loomery.lastSelectedModel',
  sessionSelectedModels: 'loomery.sessionSelectedModels',
  modelVariantSelections: 'loomery.modelVariantSelections',
  providerOrder: 'loomery.providerOrder',
  quotaWarningDismissals: 'loomery.quotaWarningDismissals',
  resetWarningDismissals: 'loomery.resetWarningDismissals',
  modelOrder: 'loomery.modelOrder',
  draftPermissionMode: 'loomery.draftPermissionMode',
  sessionPermissionModes: 'loomery.sessionPermissionModes',
  sessionSelectedMcps: 'loomery.sessionSelectedMcps',
  projectPermissionModes: 'loomery.projectPermissionModes',
  projectCurrentDocumentEnabled: 'loomery.projectCurrentDocumentEnabled',
  projectIssuesEnabled: 'loomery.projectIssuesEnabled',
  hiddenProviders: 'loomery.hiddenProviders',
  hiddenModels: 'loomery.hiddenModels',
  addedModels: 'loomery.addedModels',
  removedModels: 'loomery.removedModels',
  pinnedModels: 'loomery.pinnedModels',
  modelDisplayNames: 'loomery.modelDisplayNames',
  modelPickerOpened: 'loomery.modelPickerOpened',
  modelPickerCollapsed: 'loomery.modelPickerCollapsed',
  lastSeenSessions: 'loomery.lastSeenSessions',
  completedSessionResponses: 'loomery.completedSessionResponses',
  unsharedSessions: 'loomery.unsharedSessions',
  queuedMessages: 'loomery.queuedMessages',
  queuedMessageEdit: 'loomery.queuedMessageEdit',
  inputDraft: 'loomery.inputDraft',
  inputDraftFiles: 'loomery.inputDraftFiles',
  inputDraftProblems: 'loomery.inputDraftProblems',
  lastActiveSessionId: 'loomery.lastActiveSessionId',
  lastOpenedView: 'loomery.lastOpenedView',
  editorViewId: 'loomery.editorViewId',
  workspacePath: 'loomery.workspacePath',
  manualWorkspaceSelection: 'loomery.manualWorkspaceSelection',
  showThinking: 'loomery.showThinking',
  todoListCollapsed: 'loomery.todoListCollapsed',
  openSessionTabs: 'loomery.openSessionTabs',
} as const;

const browserPersistence = new BrowserPersistence();

export function readStored<T>(key: string): T | null {
  return browserPersistence.get<T>(key) ?? null;
}

export function writeStored<T>(key: string, value: T) {
  if (value === null || value === undefined) {
    browserPersistence.remove(key);
    return;
  }
  browserPersistence.set(key, value);
}
