import { isAbsolute, join } from 'node:path';

export type LoomeryStateKind =
  | 'servers'
  | 'opencode-v2'
  | 'provider-quota-v2'
  | 'scratch'
  | 'thumbnails';

/** Test hosts must not discover or write a production editor's ownership state. */
export function getLoomeryTestStateDirectory(kind: LoomeryStateKind): string | undefined {
  const root = process.env.LOOMERY_TEST_STATE_ROOT;
  if (root !== undefined) {
    if (!root.trim() || !isAbsolute(root))
      throw new Error('LOOMERY_TEST_STATE_ROOT must be an absolute isolated directory');
    return join(root, kind);
  }
  if (process.env.LOOMERY_TEST_SERVER_URL)
    throw new Error(
      'AI test state isolation is missing; set LOOMERY_TEST_STATE_ROOT before starting Loomery'
    );
  return undefined;
}
