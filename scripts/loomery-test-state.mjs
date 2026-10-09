import { mkdir } from 'node:fs/promises';
import path from 'node:path';

/** Scope current records and the HOME/temp paths used by older Loomery builds. */
export async function isolateLoomeryTestState(environment, root) {
  if (!path.isAbsolute(root)) throw new Error('Loomery test profile root must be absolute');
  const home = path.join(root, 'home');
  const temporary = path.join(root, 'tmp');
  const state = path.join(root, 'state');
  const localAppData = path.join(root, 'local-appdata');
  await Promise.all(
    [home, temporary, state, localAppData].map((directory) =>
      mkdir(directory, { recursive: true, mode: 0o700 })
    )
  );
  Object.assign(environment, {
    LOOMERY_TEST_STATE_ROOT: path.join(state, 'loomery-test'),
    HOME: home,
    USERPROFILE: home,
    LOCALAPPDATA: localAppData,
    XDG_STATE_HOME: state,
    TMPDIR: temporary,
    TMP: temporary,
    TEMP: temporary,
  });
  return environment.LOOMERY_TEST_STATE_ROOT;
}
