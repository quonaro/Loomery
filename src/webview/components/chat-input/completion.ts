import type { CompletionItem, MentionCompletionItem, MentionScope } from './CompletionMenu';
import type { Agent, Session } from '../../types';
import type {
  DroppedFile,
  WorkspaceFolderContext,
  DatabaseTableReference,
  EditorDiagnostic,
  WorkspaceProblemsSnapshot,
  TerminalContextReference,
} from '../../../shared/protocol';
import { normalizeSessionTitle } from '../../../shared/session-title';
import { getWorkspaceFolderLabel } from '../../../shared/workspace-folders';
import { formatSkillReference } from '../../lib/skill-reference';
import { getWorkspaceRelativePath } from '../../lib/path-display';
import { problemIdentity, uniqueProblems } from '../../lib/editor-problems';

export const SKILLS_COMMAND_NAME = 'skills';
export const PROBLEMS_COMMAND_NAME = 'problems';

export function getProblemCompletionItems(
  snapshot: WorkspaceProblemsSnapshot | null,
  query: string,
  workspacePath: string | null,
  excluded?: ReadonlySet<string>
): CompletionItem[] {
  if (!snapshot?.total) return [];
  const available = uniqueProblems(snapshot.diagnostics).filter(
    (diagnostic) => !excluded?.has(problemIdentity(diagnostic))
  );
  if (available.length === 0) return [];
  const normalized = query.trim().toLowerCase().replace(/\\/g, '/');
  const terms = normalized.split(/\s+/).filter(Boolean);
  const all: CompletionItem = {
    key: 'problems:all',
    type: 'problems',
    label: 'All',
    detail: `${available.length} workspace ${available.length === 1 ? 'problem' : 'problems'}`,
    diagnostic: null,
    severity: available.some((diagnostic) => diagnostic.severity === 'error')
      ? 'error'
      : available.some((diagnostic) => diagnostic.severity === 'warning')
        ? 'warning'
        : 'info',
  };
  if (normalized === 'all') return [all];
  const matches = available
    .map((diagnostic, index) => ({ diagnostic, index }))
    .filter(({ diagnostic }) => {
      const searchable = [
        diagnostic.message,
        diagnostic.path,
        diagnostic.source,
        diagnostic.code,
        diagnostic.severity,
        diagnostic.line,
        `${diagnostic.source ?? ''}${diagnostic.code ?? ''}`,
      ]
        .join(' ')
        .toLowerCase()
        .replace(/\\/g, '/');
      return terms.every((term) => searchable.includes(term));
    })
    .map(({ diagnostic, index }) => ({
      key: `problems:${index}`,
      type: 'problems' as const,
      label: diagnostic.message.replace(/\s+/g, ' ').slice(0, 180),
      detail: `${diagnostic.severity} · ${getWorkspaceRelativePath(diagnostic.path, workspacePath) ?? diagnostic.path}:${diagnostic.line}${diagnostic.code !== undefined ? ` · ${diagnostic.code}` : ''}`,
      diagnostic,
    }));
  return matches.length > 0 ? [all, ...matches] : [];
}

export type MentionSkillEntry = {
  name: string;
  description: string;
};

const MENTION_SCOPE_ALIASES = new Map<string, MentionScope>([
  ['file', 'file'],
  ['files', 'file'],
  ['directory', 'directory'],
  ['directories', 'directory'],
  ['dir', 'directory'],
  ['folder', 'directory'],
  ['folders', 'directory'],
  ['rule', 'rules'],
  ['rules', 'rules'],
  ['terminal', 'terminal'],
  ['terminals', 'terminal'],
  ['term', 'terminal'],
]);

// Session and skill scopes reuse the dedicated session/skill completion
// pipelines instead of the generic mention item union.
const MENTION_SESSION_SCOPE_ALIASES = new Set(['session', 'sessions']);
const MENTION_SKILL_SCOPE_ALIASES = new Set(['skill', 'skills']);

export function getMentionScopeItems(): MentionCompletionItem[] {
  return [
    {
      key: 'scope:file',
      type: 'scope',
      scope: 'file',
      label: 'Files',
      detail: 'Search workspace files',
      value: '@file:',
    },
    {
      key: 'scope:directory',
      type: 'scope',
      scope: 'directory',
      label: 'Directories',
      detail: 'Search workspace folders',
      value: '@directory:',
    },
    {
      key: 'scope:session',
      type: 'scope',
      scope: 'session',
      label: 'Conversations',
      detail: 'Reference another conversation',
      value: '@session:',
    },
    {
      key: 'scope:skill',
      type: 'scope',
      scope: 'skill',
      label: 'Skills',
      detail: 'Attach a skill',
      value: '@skill:',
    },
    {
      key: 'scope:rules',
      type: 'scope',
      scope: 'rules',
      label: 'Rules',
      detail: 'Attach instruction files',
      value: '@rules:',
    },
    {
      key: 'scope:terminal',
      type: 'scope',
      scope: 'terminal',
      label: 'Terminal',
      detail: 'Attach terminal output',
      value: '@terminal:',
    },
  ];
}

type AgentMentionCompletionItem = Extract<MentionCompletionItem, { type: 'agent' }>;
type FileMentionCompletionItem = Extract<MentionCompletionItem, { type: 'file' }>;

type MentionAgentEntry = {
  item: AgentMentionCompletionItem;
  normalizedName: string;
  normalizedDescription: string;
};

type MentionFileEntry = {
  item: FileMentionCompletionItem;
  normalizedPath: string;
};

export type MentionCompletionSource = {
  tableItems: Array<Extract<MentionCompletionItem, { type: 'table' }>>;
  agentEntries: MentionAgentEntry[];
  fileEntries: MentionFileEntry[];
  exactAgentNames: ReadonlySet<string>;
  exactFilePaths: ReadonlySet<string>;
};

export type CompletionSelection =
  | { type: 'attach-problems'; diagnostic: EditorDiagnostic | null }
  | { type: 'set-slash'; value: string }
  | { type: 'run-slash'; value: string }
  | { type: 'apply-scope'; value: string }
  | { type: 'apply-terminal'; terminal: TerminalContextReference }
  | {
      type: 'apply-mention';
      value: string;
      file?: DroppedFile;
      session?: Session;
      table?: DatabaseTableReference;
    };

export function getActiveCompletion(text: string, cursor: number) {
  if (cursor < 0 || cursor > text.length) return null;

  const prefix = text.slice(0, cursor);
  const problemsMatch = prefix.match(/(?:^|\s)(\/problems[ \t]+[^\r\n]*)$/i);
  if (problemsMatch) {
    const value = problemsMatch[1]!;
    return {
      type: 'slash' as const,
      query: value.slice(1).replace(/^problems[ \t]+/i, 'problems '),
      start: cursor - value.length,
      end: cursor,
    };
  }
  const inlineSkillsMatch = prefix.match(/(?:^|\s)(\/skills(?:[ \t]+([^\s]*))?)$/i);
  if (inlineSkillsMatch) {
    const start = cursor - inlineSkillsMatch[1]!.length;
    if (text.slice(0, start).trim()) {
      return {
        type: 'skill' as const,
        query: inlineSkillsMatch[2] ?? '',
        start,
        end: cursor,
      };
    }
  }
  const tokenStart = Math.max(prefix.lastIndexOf(' '), prefix.lastIndexOf('\n')) + 1;
  const token = prefix.slice(tokenStart);
  if (token.startsWith('$')) {
    return {
      type: 'skill' as const,
      query: token.slice(1),
      start: tokenStart,
      end: cursor,
    };
  }
  if (token.startsWith('/')) {
    return {
      type: 'slash' as const,
      query: token.slice(1),
      start: tokenStart,
      end: cursor,
    };
  }

  const skillMatch = prefix.match(
    new RegExp(`(?:^|\\s)(/${SKILLS_COMMAND_NAME}(?:\\s+[^\\s]*)?)$`, 'i')
  );
  if (skillMatch) {
    const value = skillMatch[1]!;
    return {
      type: 'slash' as const,
      query: value.slice(1),
      start: cursor - value.length,
      end: cursor,
    };
  }

  if (token.startsWith('&')) {
    return {
      type: 'session' as const,
      query: token.slice(1),
      start: tokenStart,
      end: cursor,
    };
  }
  if (!token.startsWith('@')) return null;

  const mentionBody = token.slice(1);
  const scopeSeparator = mentionBody.indexOf(':');
  if (scopeSeparator > 0) {
    const scopeKeyword = mentionBody.slice(0, scopeSeparator).toLowerCase();
    const scopedQuery = mentionBody.slice(scopeSeparator + 1);
    if (MENTION_SESSION_SCOPE_ALIASES.has(scopeKeyword)) {
      return {
        type: 'session' as const,
        query: scopedQuery,
        start: tokenStart,
        end: cursor,
      };
    }
    if (MENTION_SKILL_SCOPE_ALIASES.has(scopeKeyword)) {
      return {
        type: 'skill' as const,
        query: scopedQuery,
        start: tokenStart,
        end: cursor,
      };
    }
    const mentionScope = MENTION_SCOPE_ALIASES.get(scopeKeyword);
    if (mentionScope) {
      return {
        type: 'mention' as const,
        scope: mentionScope,
        query: scopedQuery,
        start: tokenStart,
        end: cursor,
      };
    }
  }

  return {
    type: 'mention' as const,
    scope: 'all' as const,
    query: mentionBody,
    start: tokenStart,
    end: cursor,
  };
}

export function applySlashCompletion(
  text: string,
  completion: { query: string; start: number; end: number },
  value: string
) {
  if (value === `/${SKILLS_COMMAND_NAME} ` && text.slice(0, completion.start).trim()) {
    return {
      value: `${text.slice(0, completion.start)}$${text.slice(completion.end)}`,
      cursor: completion.start + 1,
    };
  }
  if (value === `/${SKILLS_COMMAND_NAME} ` || value === `/${PROBLEMS_COMMAND_NAME} `) {
    const suffix = text.slice(completion.end).replace(/^[ \t]+/, '');
    const nextValue = `${text.slice(0, completion.start)}${value}${suffix}`;
    return {
      value: nextValue,
      cursor: completion.start + value.length,
    };
  }

  if (completion.query.toLowerCase().startsWith(`${SKILLS_COMMAND_NAME} `)) {
    const before = text.slice(0, completion.start).trimEnd();
    const after = text.slice(completion.end).trimStart();
    const args = before && after ? `${before} ${after}` : before || after;
    const nextValue = args ? `${value} ${args}` : value;
    return { value: nextValue, cursor: nextValue.length };
  }

  return { value, cursor: value.length };
}

export function getSessionCompletionItems(
  sessions: Session[],
  workspaceFolders: readonly WorkspaceFolderContext[] = []
): MentionCompletionItem[] {
  return sessions.slice(0, 10).map((session) => ({
    key: `session:${session.id}`,
    type: 'session',
    label: normalizeSessionTitle(session.title) || 'Untitled',
    detail:
      workspaceFolders.length > 1
        ? session.workspaceScope === 'workspace'
          ? 'Workspace'
          : (getWorkspaceFolderLabel(session.directory, workspaceFolders) ?? '')
        : '',
    value: `session:${session.id} `,
    session,
  }));
}

export function normalizeSessionLookupQuery(query: string) {
  return query
    .trim()
    .replace(/^sessions?:/i, '')
    .toLowerCase();
}

export function getSessionReferenceIds(text: string) {
  return Array.from(text.matchAll(/(?:^|\s)session:([a-z0-9_-]+)/gi), (match) => match[1]!);
}

export function getLeadingSlashCommand(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/^\/([^\s]+)(?:\s+(.*))?$/);
  if (!match) return null;

  return {
    name: match[1]!.toLowerCase(),
    args: match[2]?.trim() || '',
  };
}

export function getCompletionSelection(
  completion: ReturnType<typeof getActiveCompletion> | null,
  item: CompletionItem | undefined,
  confirm = false
): CompletionSelection | null {
  if (!completion || !item) return null;
  if (item.type === 'scope') {
    return { type: 'apply-scope', value: item.value };
  }
  if (item.type === 'terminal') {
    return { type: 'apply-terminal', terminal: item.terminal };
  }
  if (item.type === 'problems' && completion.type === 'slash') {
    return { type: 'attach-problems', diagnostic: item.diagnostic };
  }

  if (completion.type === 'skill') {
    if (item.type !== 'skill') return null;
    return { type: 'apply-mention', value: formatSkillReference(item.name) };
  }

  if (completion.type === 'slash') {
    if (!('name' in item)) return null;
    if (completion.query.toLowerCase().startsWith(`${SKILLS_COMMAND_NAME} `)) {
      return {
        type: 'set-slash',
        value: `/${item.name}`,
      };
    }
    if (item.name === SKILLS_COMMAND_NAME) {
      return { type: 'set-slash', value: `/${SKILLS_COMMAND_NAME} ` };
    }
    if (item.name === PROBLEMS_COMMAND_NAME) {
      return { type: 'set-slash', value: `/${PROBLEMS_COMMAND_NAME} ` };
    }
    const normalizedQuery = completion.query.trim().toLowerCase();
    const selectsExactCommand =
      normalizedQuery === item.name.toLowerCase() ||
      item.aliases.some((alias) => normalizedQuery === alias.toLowerCase());
    return {
      type: confirm || selectsExactCommand ? 'run-slash' : 'set-slash',
      value: `/${item.name}`,
    };
  }

  if (!('value' in item)) return null;

  const file = item.type === 'file' ? item.file : undefined;
  if (item.type === 'table') return { type: 'apply-mention', value: '', table: item.table };
  const session = item.type === 'session' ? item.session : undefined;

  return {
    type: 'apply-mention',
    value: item.value,
    file,
    session,
  };
}

export function getAgentBadgeLine(agent: Agent) {
  const badges: string[] = [];
  badges.push(agent.mode === 'subagent' ? 'Subagent' : 'Primary');
  const editMode = getAgentPermissionMode(agent, 'edit', 'deny');
  if (editMode === 'allow') badges.push('Can edit');
  else if (editMode === 'ask') badges.push('Edits ask');
  else badges.push('No edits');

  const bashMode = getAgentPermissionMode(agent, 'bash', 'allow');
  if (bashMode === 'deny') badges.push('No bash');
  else if (bashMode === 'ask') badges.push('Bash asks');
  else badges.push('Bash allowed');

  return badges.join(' · ');
}

function getAgentPermissionMode(
  agent: Agent,
  permission: string,
  fallback: 'ask' | 'allow' | 'deny'
) {
  if (Array.isArray(agent.permission)) {
    return (
      agent.permission.find((rule) => rule.permission === permission && rule.pattern === '*')
        ?.action ??
      agent.permission.find((rule) => rule.permission === permission)?.action ??
      fallback
    );
  }
  if (permission === 'edit') return agent.permission.edit ?? fallback;
  if (permission === 'bash') return agent.permission.bash?.['*'] ?? fallback;
  return fallback;
}

export function getMentionCompletionItems({
  rawQuery,
  agents,
  files,
  source,
  scope = 'all',
  sessions = [],
  skills = [],
  rules = [],
  terminals = [],
}: {
  rawQuery: string;
  agents?: Agent[];
  files?: DroppedFile[];
  source?: MentionCompletionSource;
  scope?: MentionScope;
  sessions?: Session[];
  skills?: MentionSkillEntry[];
  rules?: DroppedFile[];
  terminals?: TerminalContextReference[];
}): MentionCompletionItem[] {
  const mentionSource =
    source ?? createMentionCompletionSource({ agents: agents ?? [], files: files ?? [] });
  const query = rawQuery.toLowerCase();
  const exactAgentMatch = mentionSource.exactAgentNames.has(query);
  const exactFileMatch = mentionSource.exactFilePaths.has(normalizeMentionPath(rawQuery));
  if (query && (exactAgentMatch || exactFileMatch)) return [];

  if (scope === 'file' || scope === 'directory') {
    const wantedType = scope === 'directory' ? 'directory' : 'file';
    return mentionSource.fileEntries
      .filter((entry) => entry.item.file.type === wantedType)
      .map((entry) => entry.item)
      .slice(0, 10);
  }

  if (scope === 'rules') {
    const matches = rawQuery
      ? rules.filter((file) => matchesMentionQuery(query, [file.relativePath, file.path]))
      : rules;
    return toRuleFileItems(matches).slice(0, 10);
  }

  if (scope === 'terminal') {
    const matches = rawQuery
      ? terminals.filter((terminal) => matchesMentionQuery(query, [terminal.name]))
      : terminals;
    return toTerminalItems(matches).slice(0, 10);
  }

  const agentItems = mentionSource.agentEntries
    .filter((agent) => {
      if (!query) return true;
      return agent.normalizedName.includes(query) || agent.normalizedDescription.includes(query);
    })
    .map((agent) => agent.item);

  const fileItems = (rawQuery ? mentionSource.fileEntries : []).map((entry) => entry.item);

  if (!rawQuery) {
    return agentItems.slice(0, 10);
  }

  const sessionItems = sessions
    .filter((session) => matchesMentionQuery(query, [session.title, session.id]))
    .slice(0, 10)
    .map((session) => ({
      key: `session:${session.id}`,
      type: 'session' as const,
      label: normalizeSessionTitle(session.title) || 'Untitled',
      detail: '',
      value: `session:${session.id} `,
      session,
    }));

  const skillItems = skills
    .filter((skill) => matchesMentionQuery(query, [skill.name, skill.description]))
    .slice(0, 10)
    .map((skill) => ({
      key: `skill-ref:${skill.name}`,
      type: 'skill-ref' as const,
      label: skill.name,
      detail: skill.description,
      value: formatSkillReference(skill.name),
      skillName: skill.name,
    }));

  const terminalItems = toTerminalItems(
    terminals.filter((terminal) => matchesMentionQuery(query, [terminal.name]))
  );

  return [
    ...agentItems,
    ...mentionSource.tableItems,
    ...fileItems,
    ...sessionItems,
    ...skillItems,
    ...terminalItems,
  ].slice(0, 10);
}

function toRuleFileItems(files: DroppedFile[]): MentionCompletionItem[] {
  return files.map((file) => ({
    key: `rules:${file.path}`,
    type: 'file' as const,
    label: file.relativePath,
    detail: 'Rule file',
    value: `@${formatMentionPath(file.relativePath)} `,
    file,
  }));
}

function toTerminalItems(terminals: TerminalContextReference[]): MentionCompletionItem[] {
  return terminals.map((terminal) => ({
    key: `terminal:${terminal.id}`,
    type: 'terminal' as const,
    label: terminal.name,
    detail: terminal.hasOutput
      ? `${terminal.lineCount} ${terminal.lineCount === 1 ? 'line' : 'lines'}`
      : 'No output yet',
    value: '',
    terminal,
  }));
}

function matchesMentionQuery(query: string, values: Array<string | undefined>) {
  if (!query) return true;
  return values.some((value) => value?.toLowerCase().includes(query));
}

export function createMentionCompletionSource({
  agents,
  files,
  tables = [],
}: {
  agents: Agent[];
  files: DroppedFile[];
  tables?: DatabaseTableReference[];
}): MentionCompletionSource {
  const exactAgentNames = new Set<string>();
  const exactFilePaths = new Set<string>();

  const agentEntries = agents.map((agent) => {
    const normalizedName = agent.name.toLowerCase();
    exactAgentNames.add(normalizedName);

    return {
      item: {
        key: `agent:${agent.name}`,
        type: 'agent',
        label: agent.name,
        detail: agent.description || getAgentBadgeLine(agent),
        value: `@${agent.name} `,
      },
      normalizedName,
      normalizedDescription: agent.description?.toLowerCase() || '',
    } satisfies MentionAgentEntry;
  });

  const fileEntries = files.map((file) => {
    const normalizedPath = normalizeMentionPath(file.relativePath);
    exactFilePaths.add(normalizedPath);

    return {
      item: {
        key: `file:${file.path}`,
        type: 'file',
        label: file.relativePath,
        detail: file.type === 'directory' ? 'Folder' : 'Workspace file',
        value:
          file.type === 'directory'
            ? `@${formatMentionPath(file.relativePath)}/`
            : `@${formatMentionPath(file.relativePath)} `,
        file,
      },
      normalizedPath,
    } satisfies MentionFileEntry;
  });

  return {
    tableItems: tables.map((table) => ({
      key: `table:${table.id}`,
      type: 'table',
      label: table.name,
      detail: `${table.dataSource} · Table`,
      value: '',
      table,
    })),
    agentEntries,
    fileEntries,
    exactAgentNames,
    exactFilePaths,
  };
}

export function shouldRequestMentionFileSearch(previousQuery: string | null, nextQuery: string) {
  return previousQuery !== nextQuery;
}

function normalizeMentionPath(value: string) {
  return value.replace(/^@/, '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function formatMentionPath(value: string) {
  return value.replace(/^@/, '').replace(/\\/g, '/').replace(/\/+$/, '');
}

export function shouldPadInlineInsertion(value: string | undefined) {
  return !!value && !/\s/.test(value);
}

export function getInlineInsertionSuffix(text: string, selectionEnd: number) {
  return selectionEnd >= text.length || shouldPadInlineInsertion(text[selectionEnd]) ? ' ' : '';
}

export function getMentionInsertionTrailingSpace(value: string, after: string | undefined) {
  if (value.endsWith(' ') || value.endsWith('\n')) return '';
  return !after || (after !== ' ' && after !== '\n') ? ' ' : '';
}
