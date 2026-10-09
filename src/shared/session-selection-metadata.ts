/* oxlint-disable anti-slop/no-unknown-parameters -- Session metadata is an external OpenCode boundary; validate selections before restoring them. */
import { LOOMERY_SESSION_METADATA_VERSION } from './protocol';
import type { ChatModelSelection, PermissionMode } from './protocol';
import { asRecord, isString } from './type-utils';
import type { UnknownRecord } from './type-utils';

export type SessionSelectionMetadata = {
  model?: ChatModelSelection;
  agent?: string;
};

type LoomeryModelMetadata = {
  provider: string;
  model: string;
  variant?: string;
};

export function mergeLoomerySessionMetadata(
  metadata: unknown,
  update: SessionSelectionMetadata & { permissionMode?: PermissionMode }
) {
  const existing = asRecord(metadata);
  const loomery: UnknownRecord = {
    ...asRecord(existing?.loomery),
    schemaVersion: LOOMERY_SESSION_METADATA_VERSION,
  };
  if (update.permissionMode !== undefined) loomery.permissionMode = update.permissionMode;
  if (update.agent !== undefined) loomery.agent = update.agent;
  if (update.model) {
    const model: LoomeryModelMetadata = {
      provider: update.model.providerID,
      model: update.model.modelID,
    };
    if (update.model.variant) model.variant = update.model.variant;
    loomery.model = model;
  }
  return { ...existing, loomery };
}

export function readSessionModelMetadata(metadata: unknown): ChatModelSelection | undefined {
  const model = asRecord(asRecord(asRecord(metadata)?.loomery)?.model);
  if (
    !isString(model?.provider) ||
    !model.provider.trim() ||
    !isString(model.model) ||
    !model.model.trim() ||
    (model.variant !== undefined && !isString(model.variant))
  )
    return undefined;
  const selection: ChatModelSelection = { providerID: model.provider, modelID: model.model };
  if (model.variant) selection.variant = model.variant;
  return selection;
}

export function readSessionAgentMetadata(metadata: unknown): string | undefined {
  const agent = asRecord(asRecord(metadata)?.loomery)?.agent;
  return isString(agent) && agent.trim() ? agent : undefined;
}
