import { describe, expect, it } from 'vitest';
import {
  mergeLoomerySessionMetadata,
  readSessionAgentMetadata,
  readSessionModelMetadata,
} from './session-selection-metadata';

describe('session selection metadata', () => {
  it('rejects malformed selections without affecting independent fields', () => {
    for (const metadata of [
      undefined,
      null,
      {},
      { loomery: { model: 'model' } },
      { loomery: { model: { provider: '', model: 'model' } } },
      { loomery: { model: { provider: 'provider', model: ' ' } } },
      { loomery: { model: { provider: 'provider', model: 'model', variant: 5 } } },
    ]) {
      expect(readSessionModelMetadata(metadata)).toBeUndefined();
    }
    for (const agent of [undefined, null, '', ' ', 5, {}]) {
      expect(readSessionAgentMetadata({ loomery: { agent } })).toBeUndefined();
    }
    expect(readSessionAgentMetadata({ loomery: { model: 'invalid', agent: 'custom-agent' } })).toBe(
      'custom-agent'
    );
    expect(
      readSessionModelMetadata({
        loomery: { model: { provider: 'provider', model: 'model', variant: 'low' } },
      })
    ).toEqual({ providerID: 'provider', modelID: 'model', variant: 'low' });
    expect(
      readSessionModelMetadata({ loomery: { model: { provider: 'provider', model: 'model' } } })
    ).toEqual({ providerID: 'provider', modelID: 'model' });
  });

  it('merges nested selections while preserving workspace scope and unrelated metadata', () => {
    const metadata = {
      other: { enabled: true },
      loomery: {
        schemaVersion: 1,
        workspaceScope: 'folder',
        custom: 'kept',
        permissionMode: 'auto',
        model: { provider: 'old', model: 'old-model', variant: 'high' },
      },
    };
    const next = mergeLoomerySessionMetadata(metadata, {
      model: { providerID: 'openai', modelID: 'new-model' },
      agent: 'build',
    });
    expect(next).toEqual({
      other: { enabled: true },
      loomery: {
        schemaVersion: 1,
        workspaceScope: 'folder',
        custom: 'kept',
        permissionMode: 'auto',
        model: { provider: 'openai', model: 'new-model' },
        agent: 'build',
      },
    });
    expect(metadata.loomery.model.variant).toBe('high');
    expect(mergeLoomerySessionMetadata(undefined, { permissionMode: 'full' })).toEqual({
      loomery: { schemaVersion: 1, permissionMode: 'full' },
    });
  });
});
