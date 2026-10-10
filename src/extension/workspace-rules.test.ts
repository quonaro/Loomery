/* oxlint-disable anti-slop/no-module-mocking, anti-slop/require-safety-comment-for-type-assertion -- These tests verify the VS Code rule discovery boundary with partial workspace fixtures. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const folder = vi.hoisted(() => ({ name: 'repo', uri: { fsPath: '/repo' } }));

const vscodeMock = vi.hoisted(() => ({
  workspace: {
    workspaceFolders: [] as Array<{ name: string; uri: { fsPath: string } }>,
    findFiles: vi.fn(),
    getWorkspaceFolder: vi.fn(),
    asRelativePath: vi.fn((uri: { fsPath: string }) => uri.fsPath.replace('/repo/', '')),
  },
  Uri: { file: vi.fn((fsPath: string) => ({ fsPath })) },
}));

vi.mock('vscode', () => vscodeMock);
vi.mock('./working-folders', () => ({
  getWorkingFolders: () => [folder],
}));

async function loadModule() {
  return import('./workspace-rules');
}

describe('getWorkspaceRules', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vscodeMock.workspace.workspaceFolders = [folder];
    vscodeMock.workspace.getWorkspaceFolder.mockImplementation((uri: { fsPath: string }) =>
      uri.fsPath.startsWith('/repo') ? folder : undefined
    );
  });

  it('collects, dedupes, and sorts rule files from every pattern', async () => {
    vscodeMock.workspace.findFiles.mockImplementation(async (pattern: string) => {
      if (pattern === 'AGENTS.md') return [{ fsPath: '/repo/AGENTS.md' }];
      if (pattern === '**/AGENTS.md') {
        return [{ fsPath: '/repo/AGENTS.md' }, { fsPath: '/repo/pkg/AGENTS.md' }];
      }
      if (pattern === '.cursor/rules/**/*') return [{ fsPath: '/repo/.cursor/rules/style.mdc' }];
      return [];
    });

    const { getWorkspaceRules } = await loadModule();
    const snapshot = await getWorkspaceRules();

    expect(snapshot.files).toEqual([
      {
        path: '/repo/.cursor/rules/style.mdc',
        relativePath: '.cursor/rules/style.mdc',
        type: 'file',
      },
      { path: '/repo/AGENTS.md', relativePath: 'AGENTS.md', type: 'file' },
      { path: '/repo/pkg/AGENTS.md', relativePath: 'pkg/AGENTS.md', type: 'file' },
    ]);
  });

  it('ignores matches outside the open workspace folders', async () => {
    vscodeMock.workspace.getWorkspaceFolder.mockReturnValue(undefined);
    vscodeMock.workspace.findFiles.mockResolvedValue([{ fsPath: '/outside/AGENTS.md' }]);

    const { getWorkspaceRules } = await loadModule();
    expect(await getWorkspaceRules()).toEqual({ files: [] });
  });
});
