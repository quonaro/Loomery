import * as vscode from 'vscode';
import type { DroppedFile, WorkspaceRulesSnapshot } from '../shared/protocol';
import { getWorkspaceFolderLabel } from '../shared/workspace-folders';
import { isSameWorkspacePath } from '../shared/workspace-path';
import { getRelativePath } from './util/path';
import { getWorkingFolders } from './working-folders';

/**
 * Instruction files that Loomery treats as workspace rules. The `@rules`
 * picker surfaces these as attachable context, mirroring the AGENTS.md and
 * Cursor/Copilot conventions the init flow already knows about.
 */
const RULE_FILE_PATTERNS = [
  'AGENTS.md',
  '**/AGENTS.md',
  '.cursorrules',
  '**/.cursorrules',
  '.cursor/rules/**/*',
  '**/.cursor/rules/**/*',
  '.github/copilot-instructions.md',
  '**/.github/copilot-instructions.md',
] as const;

const RULE_SEARCH_EXCLUDE = '**/{node_modules,.git,dist,build,out,coverage,.next,.turbo}/**';

/**
 * Discover workspace instruction files. Results are deduplicated by canonical
 * path and sorted by relative path so the picker stays stable between calls.
 */
export async function getWorkspaceRules(): Promise<WorkspaceRulesSnapshot> {
  const folders = getWorkingFolders();
  if (folders.length === 0) return { files: [] };

  const folderContexts = folders.map((folder) => ({
    name: folder.name,
    path: folder.uri.fsPath,
  }));
  const seen = new Set<string>();
  const files: DroppedFile[] = [];

  for (const pattern of RULE_FILE_PATTERNS) {
    let uris: vscode.Uri[];
    try {
      uris = await vscode.workspace.findFiles(pattern, RULE_SEARCH_EXCLUDE, 200);
    } catch {
      continue;
    }
    for (const uri of uris) {
      const owningFolder = vscode.workspace.getWorkspaceFolder(uri);
      if (
        !owningFolder ||
        !folders.some((f) => isSameWorkspacePath(f.uri.fsPath, owningFolder.uri.fsPath))
      ) {
        continue;
      }
      const identity = uri.fsPath.replace(/\\/g, '/').toLowerCase();
      if (seen.has(identity)) continue;
      seen.add(identity);
      const relativePath =
        folders.length > 1
          ? `${getWorkspaceFolderLabel(owningFolder.uri.fsPath, folderContexts) ?? owningFolder.name}/${getRelativePath(uri, owningFolder)}`
          : getRelativePath(uri, owningFolder);
      files.push({ path: uri.fsPath, relativePath, type: 'file' });
    }
  }

  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return { files };
}
