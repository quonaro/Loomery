import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createIdeInstallPlan,
  createVscodeInstallPlan,
  dedupeCliFamilies,
  dedupeClisByTarget,
  normalizeCliAlias,
  parseInstallArgs,
  selectRequestedClis,
  splitCliList,
} from './vscode-install.mjs';

test('splits CLI lists on commas, spaces, colons, and semicolons', () => {
  assert.deepEqual(splitCliList('code,cursor trae;codium:kiro'), [
    'code',
    'cursor',
    'trae',
    'codium',
    'kiro',
  ]);
  assert.deepEqual(splitCliList(''), []);
  assert.deepEqual(splitCliList(undefined), []);
});

test('normalizes the vscode alias and keeps paths verbatim', () => {
  assert.equal(normalizeCliAlias('VSCode'), 'code');
  assert.equal(normalizeCliAlias('Cursor'), 'cursor');
  assert.equal(normalizeCliAlias('/opt/cursor/bin/cursor'), '/opt/cursor/bin/cursor');
});

test('parses target flags, positionals, and mode flags', () => {
  assert.deepEqual(parseInstallArgs([]), { targets: [], all: false, list: false, dryRun: false });
  assert.deepEqual(parseInstallArgs(['--target', 'code,cursor']).targets, ['code', 'cursor']);
  assert.deepEqual(parseInstallArgs(['--target=codium']).targets, ['codium']);
  assert.deepEqual(parseInstallArgs(['cursor', 'trae']).targets, ['cursor', 'trae']);
  assert.equal(parseInstallArgs(['--all']).all, true);
  assert.equal(parseInstallArgs(['all']).targets[0], 'all');
  assert.equal(parseInstallArgs(['--list']).list, true);
  assert.equal(parseInstallArgs(['--dry-run']).dryRun, true);
  assert.throws(() => parseInstallArgs(['--bogus']), /Unknown flag/);
});

test('selects explicit targets over environment overrides and auto-detection', () => {
  const explicit = selectRequestedClis({
    args: { targets: ['cursor'], all: false },
    env: { LOOMERY_VSCODE_CLIS: 'code', LOOMERY_VSCODE_CLI: 'codium' },
  });
  assert.deepEqual(explicit, { requested: ['cursor'], mode: 'explicit' });

  const envList = selectRequestedClis({
    args: { targets: [], all: false },
    env: { LOOMERY_VSCODE_CLIS: 'code, cursor' },
  });
  assert.deepEqual(envList, { requested: ['code', 'cursor'], mode: 'env-list' });

  const envSingle = selectRequestedClis({
    args: { targets: [], all: false },
    env: { LOOMERY_VSCODE_CLI: 'codium' },
  });
  assert.deepEqual(envSingle, { requested: ['codium'], mode: 'env-single' });

  const auto = selectRequestedClis({ args: { targets: [], all: false }, env: {} });
  assert.equal(auto.mode, 'auto');
  assert.ok(auto.requested.includes('code'));
  assert.ok(auto.requested.includes('cursor'));

  const all = selectRequestedClis({
    args: { targets: [], all: true },
    env: { LOOMERY_VSCODE_CLI: 'code' },
  });
  assert.deepEqual(all.mode, 'all');
});

test('builds one install command per resolved CLI with a shared package step', () => {
  const plan = createIdeInstallPlan({
    projectRoot: '/repo',
    packageName: 'loomery',
    packageVersion: '0.32.5',
    platform: 'linux',
    nodePath: '/usr/bin/node',
    npmExecPath: '/usr/lib/npm-cli.js',
    env: { PATH: '/usr/bin' },
    clis: [
      { name: 'codium', command: '/usr/bin/codium' },
      { name: 'cursor', command: '/usr/bin/cursor' },
    ],
  });
  assert.equal(plan.vsixPath, '/repo/loomery-0.32.5.vsix');
  assert.deepEqual(plan.packageCommand.args, ['/usr/lib/npm-cli.js', 'run', 'package']);
  assert.equal(plan.installCommands.length, 2);
  assert.deepEqual(plan.installCommands[0].args, [
    '--install-extension',
    '/repo/loomery-0.32.5.vsix',
    '--force',
  ]);
  assert.throws(
    () =>
      createIdeInstallPlan({
        projectRoot: '/repo',
        packageName: 'loomery',
        packageVersion: '0.32.5',
        platform: 'linux',
        nodePath: '/usr/bin/node',
        npmExecPath: '/usr/lib/npm-cli.js',
        env: {},
        clis: [],
      }),
    /at least one resolved CLI/
  );
});

test('keeps the legacy single-CLI plan shape for existing callers', () => {
  const plan = createVscodeInstallPlan({
    projectRoot: '/repo',
    packageName: 'loomery',
    packageVersion: '0.32.5',
    platform: 'linux',
    nodePath: '/usr/bin/node',
    npmExecPath: '/usr/lib/npm-cli.js',
    env: {},
  });
  assert.deepEqual(plan.installCommand.args, [
    '--install-extension',
    '/repo/loomery-0.32.5.vsix',
    '--force',
  ]);
});

test('dedupes CLIs that resolve to the same executable', async () => {
  const entries = [
    { name: 'codium', command: '/usr/bin/codium' },
    { name: 'vscodium', command: '/usr/bin/codium' },
    { name: 'cursor', command: '/usr/bin/cursor' },
  ];
  const deduped = await dedupeClisByTarget(entries);
  assert.deepEqual(
    deduped.map((entry) => entry.name),
    ['codium', 'cursor']
  );
});

test('keeps one vscodium-family entry in auto mode, both when explicit', () => {
  const entries = [
    { name: 'codium', command: '/usr/bin/codium' },
    { name: 'vscodium', command: '/usr/bin/vscodium' },
  ];
  assert.deepEqual(
    dedupeCliFamilies(entries).map((entry) => entry.name),
    ['codium']
  );
  assert.equal(dedupeCliFamilies([{ name: 'vscodium', command: '/usr/bin/vscodium' }]).length, 1);
});
