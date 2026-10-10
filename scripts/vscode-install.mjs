import { access, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, posix, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import spawn from 'cross-spawn';

const scriptPath = fileURLToPath(import.meta.url);
const defaultProjectRoot = resolve(dirname(scriptPath), '..');

// All known VS Code-family CLI names. Every fork installs extensions with
// `<cli> --install-extension <vsix> --force`, so one plan covers them all.
// `devin` is intentionally absent: it is an agent CLI without
// `--install-extension` support.
export const KNOWN_IDE_CLIS = [
  'code',
  'code-insiders',
  'cursor',
  'trae',
  'windsurf',
  'codium',
  'vscodium',
  'kiro',
];

export function selectStaleVsixFiles(entries, packageName) {
  const prefix = `${packageName}-`;
  return entries.filter((entry) => entry.startsWith(prefix) && entry.endsWith('.vsix'));
}

export function splitCliList(raw) {
  if (raw == null) {
    return [];
  }
  return String(raw)
    .split(/[\s,;:]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function normalizeCliAlias(name) {
  const trimmed = String(name).trim();
  if (trimmed === '') {
    return trimmed;
  }
  if (/[/\\]/.test(trimmed)) {
    return trimmed;
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'vscode') {
    return 'code';
  }
  return lower;
}

export function parseInstallArgs(argv) {
  const result = { targets: [], all: false, list: false, dryRun: false };
  const takesValue = new Set(['--target', '--targets', '--cli', '--clis']);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--all') {
      result.all = true;
    } else if (arg === '--list') {
      result.list = true;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--') {
      continue;
    } else if (takesValue.has(arg)) {
      result.targets.push(...splitCliList(argv[index + 1]));
      index += 1;
    } else if (arg.startsWith('--target=')) {
      result.targets.push(...splitCliList(arg.slice('--target='.length)));
    } else if (arg.startsWith('--targets=')) {
      result.targets.push(...splitCliList(arg.slice('--targets='.length)));
    } else if (arg.startsWith('--cli=')) {
      result.targets.push(...splitCliList(arg.slice('--cli='.length)));
    } else if (arg.startsWith('--clis=')) {
      result.targets.push(...splitCliList(arg.slice('--clis='.length)));
    } else if (arg.startsWith('-')) {
      throw new Error(
        `Unknown flag ${arg}; expected --target <cli>, --all, --list, or --dry-run`
      );
    } else {
      result.targets.push(...splitCliList(arg));
    }
  }
  return result;
}

async function executableExists(candidate) {
  try {
    await access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function findCliExecutable(name, env, platform) {
  const trimmed = String(name).trim();
  if (trimmed === '') {
    return null;
  }
  if (/[/\\]/.test(trimmed)) {
    const candidate = resolve(trimmed);
    return (await executableExists(candidate)) ? candidate : null;
  }
  const pathValue = platform === 'win32' ? (env.PATH ?? env.Path ?? '') : (env.PATH ?? '');
  const extensions =
    platform === 'win32'
      ? String(env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
          .split(';')
          .map((ext) => ext.trim().toLowerCase())
          .filter((ext) => ext.length > 0)
      : [''];
  const directories = String(pathValue).split(platform === 'win32' ? ';' : ':');
  const names =
    platform === 'win32' && !/\.[a-z0-9]+$/i.test(trimmed)
      ? extensions.map((ext) => `${trimmed}${ext}`)
      : [trimmed];
  const joinPath = platform === 'win32' ? win32.join : posix.join;
  for (const directory of directories) {
    if (directory.trim() === '') {
      continue;
    }
    for (const fileName of names) {
      const candidate = joinPath(directory, fileName);
      if (await executableExists(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

export async function resolveRequestedClis(requested, env, platform) {
  const resolved = [];
  const missing = [];
  for (const name of requested) {
    const executable = await findCliExecutable(name, env, platform);
    if (executable) {
      resolved.push({ name, command: executable });
    } else {
      missing.push(name);
    }
  }
  return { resolved, missing };
}

export async function dedupeClisByTarget(entries) {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    let key = entry.command;
    try {
      key = await realpath(entry.command);
    } catch {
      key = entry.command;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(entry);
  }
  return result;
}

export function dedupeCliFamilies(entries) {
  // `codium` and `vscodium` are different shims over the same VSCodium
  // installation; installing twice is redundant, so keep the first found.
  const names = new Set(entries.map((entry) => entry.name));
  if (names.has('codium') && names.has('vscodium')) {
    return entries.filter((entry) => entry.name !== 'vscodium');
  }
  return entries;
}

export function selectRequestedClis({ args, env }) {
  const explicit = args.targets.filter((target) => target.toLowerCase() !== 'all');
  const wantsAll = args.all || args.targets.some((target) => target.toLowerCase() === 'all');
  if (wantsAll) {
    return { requested: [...KNOWN_IDE_CLIS], mode: 'all' };
  }
  if (explicit.length > 0) {
    return { requested: explicit.map(normalizeCliAlias), mode: 'explicit' };
  }
  const plural = splitCliList(env.LOOMERY_VSCODE_CLIS);
  if (plural.length > 0) {
    return { requested: plural.map(normalizeCliAlias), mode: 'env-list' };
  }
  const single = (env.LOOMERY_VSCODE_CLI ?? env.LOOMERY_VSCODE_EXECUTABLE ?? '').trim();
  if (single !== '') {
    return { requested: [normalizeCliAlias(single)], mode: 'env-single' };
  }
  return { requested: [...KNOWN_IDE_CLIS], mode: 'auto' };
}

export function createVscodeInstallPlan(options) {
  if (!options.npmExecPath) {
    throw new Error('npm_execpath is unavailable; run this helper with npm run vscode:install');
  }

  const pathJoin = options.platform === 'win32' ? win32.join : posix.join;
  const vsixPath = pathJoin(
    options.projectRoot,
    `${options.packageName}-${options.packageVersion}.vsix`
  );
  const vscodeCli =
    options.env.LOOMERY_VSCODE_CLI?.trim() || (options.platform === 'win32' ? 'code.cmd' : 'code');

  return {
    vsixPath,
    packageCommand: {
      command: options.nodePath,
      args: [options.npmExecPath, 'run', 'package'],
      env: options.env,
      shell: false,
    },
    installCommand: {
      command: vscodeCli,
      args: ['--install-extension', vsixPath, '--force'],
      env: { ...options.env, NODE_NO_WARNINGS: '1' },
      shell: false,
    },
  };
}

export function createIdeInstallPlan(options) {
  if (!options.npmExecPath) {
    throw new Error('npm_execpath is unavailable; run this helper with npm run vscode:install');
  }
  if (!Array.isArray(options.clis) || options.clis.length === 0) {
    throw new Error('createIdeInstallPlan requires at least one resolved CLI');
  }

  const pathJoin = options.platform === 'win32' ? win32.join : posix.join;
  const vsixPath = pathJoin(
    options.projectRoot,
    `${options.packageName}-${options.packageVersion}.vsix`
  );
  return {
    vsixPath,
    packageCommand: {
      command: options.nodePath,
      args: [options.npmExecPath, 'run', 'package'],
      env: options.env,
      shell: false,
    },
    installCommands: options.clis.map((cli) => ({
      name: cli.name,
      command: cli.command,
      args: ['--install-extension', vsixPath, '--force'],
      env: { ...options.env, NODE_NO_WARNINGS: '1' },
      shell: false,
    })),
  };
}

function runCommand(spec, cwd) {
  return new Promise((resolveCommand, rejectCommand) => {
    // cross-spawn resolves Windows .cmd shims through cmd.exe with escaped,
    // verbatim arguments while preserving direct execution on POSIX.
    const child = spawn(spec.command, spec.args, {
      cwd,
      env: spec.env,
      shell: spec.shell,
      stdio: 'inherit',
    });
    child.once('error', rejectCommand);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolveCommand();
        return;
      }
      const outcome = signal ? `signal ${signal}` : `exit code ${String(code)}`;
      rejectCommand(new Error(`${spec.command} failed with ${outcome}`));
    });
  });
}

function printDryRun(projectRoot, staleVsixFiles, plan) {
  process.stdout.write(
    [
      `Would remove: ${staleVsixFiles.join(', ') || '(none)'}`,
      `Would package: ${plan.packageCommand.command} ${plan.packageCommand.args.join(' ')}`,
      ...plan.installCommands.map(
        (install) => `Would install (${install.name}): ${install.command} ${install.args.join(' ')}`
      ),
      `Project: ${projectRoot}`,
      '',
    ].join('\n')
  );
}

async function main() {
  const manifest = JSON.parse(await readFile(join(defaultProjectRoot, 'package.json'), 'utf8'));
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- JSON boundary validation must reject malformed manifest fields before use.
  if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') {
    throw new Error('package.json must define string name and version fields');
  }

  const args = parseInstallArgs(process.argv.slice(2));
  const selection = selectRequestedClis({ args, env: process.env });
  const { resolved, missing } = await resolveRequestedClis(
    selection.requested,
    process.env,
    process.platform
  );

  if (selection.mode === 'auto' || selection.mode === 'all') {
    if (resolved.length === 0) {
      throw new Error(
        `No IDE CLI found. Probed: ${KNOWN_IDE_CLIS.join(', ')}. ` +
          'Install a VS Code-family editor CLI, add it to PATH, or pass an explicit target: ' +
          'npm run vscode:install -- --target cursor (or LOOMERY_VSCODE_CLIS="code cursor").'
      );
    }
  } else if (missing.length > 0) {
    throw new Error(
      `IDE CLI not found in PATH: ${missing.join(', ')}. ` +
        `Probed PATH for an executable file; pass a full path or install the editor CLI first.`
    );
  }

  let clis = await dedupeClisByTarget(resolved);
  if (selection.mode === 'auto' || selection.mode === 'all') {
    clis = dedupeCliFamilies(clis);
  }

  if (args.list) {
    for (const cli of clis) {
      process.stdout.write(`${cli.name} -> ${cli.command}\n`);
    }
    return;
  }

  const plan = createIdeInstallPlan({
    projectRoot: defaultProjectRoot,
    packageName: manifest.name,
    packageVersion: manifest.version,
    platform: process.platform,
    nodePath: process.execPath,
    npmExecPath: process.env.npm_execpath,
    env: process.env,
    clis,
  });
  const staleVsixFiles = selectStaleVsixFiles(await readdir(defaultProjectRoot), manifest.name);

  if (args.dryRun || process.argv.includes('--dry-run')) {
    printDryRun(defaultProjectRoot, staleVsixFiles, plan);
    return;
  }

  await Promise.all(
    staleVsixFiles.map((file) => rm(join(defaultProjectRoot, file), { force: true }))
  );
  await runCommand(plan.packageCommand, defaultProjectRoot);
  await access(plan.vsixPath);
  for (const install of plan.installCommands) {
    process.stdout.write(`Installing into ${install.name}: ${install.command}\n`);
    await runCommand(install, defaultProjectRoot);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  await main();
}
