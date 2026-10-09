import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { isolateLoomeryTestState } from './loomery-test-state.mjs';

test('isolates current and legacy editor state for independent AI profiles', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'loomery-state-fixture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const original = {
    HOME: '/host/home',
    USERPROFILE: '/host/home',
    LOCALAPPDATA: '/host/appdata',
    XDG_STATE_HOME: '/host/state',
    TMPDIR: '/host/tmp',
    TMP: '/host/tmp',
    TEMP: '/host/tmp',
    OPENCODE_DB: '/verified/fixture/opencode.db',
    LOOMERY_TEST_SERVER_URL: 'http://127.0.0.1:49999',
  };
  const profiles = ['first', 'second'].map((name) => path.join(root, name));
  const environments = await Promise.all(
    profiles.map(async (profile) => {
      const environment = { ...original };
      await isolateLoomeryTestState(environment, profile);
      return environment;
    })
  );
  for (let index = 0; index < profiles.length; index += 1) {
    const environment = environments[index];
    const profile = profiles[index];
    for (const key of [
      'HOME',
      'USERPROFILE',
      'LOCALAPPDATA',
      'XDG_STATE_HOME',
      'TMPDIR',
      'TMP',
      'TEMP',
    ]) {
      assert.ok(environment[key].startsWith(`${profile}${path.sep}`), key);
      assert.ok((await stat(environment[key])).isDirectory());
    }
    assert.equal(environment.LOOMERY_TEST_STATE_ROOT, path.join(profile, 'state/loomery-test'));
    assert.equal(environment.OPENCODE_DB, original.OPENCODE_DB);
    assert.equal(environment.LOOMERY_TEST_SERVER_URL, original.LOOMERY_TEST_SERVER_URL);
    await mkdir(environment.LOOMERY_TEST_STATE_ROOT, { recursive: true });
    assert.deepEqual(await readdir(environment.LOOMERY_TEST_STATE_ROOT), []);
  }
  assert.notEqual(environments[0].LOOMERY_TEST_STATE_ROOT, environments[1].LOOMERY_TEST_STATE_ROOT);
  assert.equal(original.HOME, '/host/home');
});

test('rejects relative profile roots before changing the environment', async () => {
  const environment = { HOME: '/host/home' };
  await assert.rejects(isolateLoomeryTestState(environment, 'relative'), /must be absolute/);
  assert.deepEqual(environment, { HOME: '/host/home' });
});

test('older Node hosts resolve home and temporary paths inside the test profile', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'loomery-legacy-paths-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const environment = { ...process.env };
  await isolateLoomeryTestState(environment, root);
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { homedir, tmpdir } from 'node:os';
    console.log(JSON.stringify({ home: homedir(), temporary: tmpdir() }));
  `,
    ],
    { env: environment, timeout: 5_000 }
  );
  assert.deepEqual(JSON.parse(stdout), {
    home: path.join(root, 'home'),
    temporary: path.join(root, 'tmp'),
  });
});
