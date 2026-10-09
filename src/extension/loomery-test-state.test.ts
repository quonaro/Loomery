import { resolve, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLoomeryTestStateDirectory } from './loomery-test-state';

afterEach(() => vi.unstubAllEnvs());

describe('Loomery test state paths', () => {
  it('leaves ordinary editor builds on their existing shared paths', () => {
    vi.stubEnv('LOOMERY_TEST_STATE_ROOT', undefined);
    vi.stubEnv('LOOMERY_TEST_SERVER_URL', undefined);
    expect(getLoomeryTestStateDirectory('servers')).toBeUndefined();
    expect(getLoomeryTestStateDirectory('opencode-v2')).toBeUndefined();
    expect(getLoomeryTestStateDirectory('provider-quota-v2')).toBeUndefined();
  });

  it('uses one explicit test root for ownership and session annotations', () => {
    const root = resolve('artifacts/ai-test-data/path-fixture');
    vi.stubEnv('LOOMERY_TEST_STATE_ROOT', root);
    expect(getLoomeryTestStateDirectory('servers')).toBe(join(root, 'servers'));
    expect(getLoomeryTestStateDirectory('opencode-v2')).toBe(join(root, 'opencode-v2'));
    expect(getLoomeryTestStateDirectory('provider-quota-v2')).toBe(join(root, 'provider-quota-v2'));
  });

  it.each(['', '  ', 'relative/state'])('refuses invalid test state root %j', (root) => {
    vi.stubEnv('LOOMERY_TEST_STATE_ROOT', root);
    expect(() => getLoomeryTestStateDirectory('servers')).toThrow('absolute isolated directory');
  });

  it('fails closed instead of using production state when a test endpoint lacks a scope', () => {
    vi.stubEnv('LOOMERY_TEST_STATE_ROOT', undefined);
    vi.stubEnv('LOOMERY_TEST_SERVER_URL', 'http://127.0.0.1:49999');
    expect(() => getLoomeryTestStateDirectory('servers')).toThrow('state isolation is missing');
    expect(() => getLoomeryTestStateDirectory('opencode-v2')).toThrow('state isolation is missing');
    expect(() => getLoomeryTestStateDirectory('provider-quota-v2')).toThrow(
      'state isolation is missing'
    );
  });
});
