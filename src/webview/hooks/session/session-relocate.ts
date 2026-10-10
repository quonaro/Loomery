import type { MessageEntry, Session } from '../../types';

export const RELOCATED_TRANSCRIPT_CHAR_LIMIT = 20_000;
const RELOCATED_TITLE_LIMIT = 80;

function readTextParts(entry: MessageEntry): string[] {
  const texts: string[] = [];
  for (const part of entry.parts) {
    if (part.type === 'text' && part.text.trim().length > 0) texts.push(part.text.trim());
  }
  return texts;
}

export function buildRelocatedSessionTranscript(messages: MessageEntry[]): string {
  const turns: string[] = [];
  for (const entry of messages) {
    if (entry.info.role !== 'user' && entry.info.role !== 'assistant') continue;
    const text = readTextParts(entry).join('\n');
    if (!text) continue;
    turns.push(`${entry.info.role === 'user' ? 'User' : 'Assistant'}:\n${text}`);
  }
  const transcript = turns.join('\n\n---\n\n');
  if (transcript.length <= RELOCATED_TRANSCRIPT_CHAR_LIMIT) return transcript;
  return `${transcript.slice(0, RELOCATED_TRANSCRIPT_CHAR_LIMIT)}\n\n[transcript truncated]`;
}

export function buildRelocationPrompt(args: {
  title: string | null;
  directory: string | null;
  transcript: string;
}): string {
  const source = args.title ? `"${args.title}"` : 'an old session';
  const location = args.directory ? ` (folder ${args.directory} no longer exists)` : '';
  const body = args.transcript
    ? `The read-only transcript copy follows:\n\n---\n\n${args.transcript}`
    : 'No cached transcript was available, so start fresh from the session title.';
  return `This conversation continues ${source}${location}. Continue the work in the current workspace.\n\n${body}`;
}

export async function relocateSessionWithDependencies(
  deps: {
    getSession(sessionId: string): Session | undefined;
    getSourceMessages(sessionId: string): MessageEntry[];
    createSession(title?: string): Promise<string | null>;
    selectSession(sessionId: string): Promise<boolean | void>;
    sendMessage(text: string): Promise<boolean | void>;
  },
  sourceId: string
): Promise<string | null> {
  const source = deps.getSession(sourceId);
  const transcript = buildRelocatedSessionTranscript(deps.getSourceMessages(sourceId));
  const title = source?.title?.trim()
    ? `Relocated: ${source.title.trim().slice(0, RELOCATED_TITLE_LIMIT)}`
    : 'Relocated session';
  const relocatedId = await deps.createSession(title);
  if (!relocatedId) throw new Error('Could not create a session in the current workspace');
  await deps.selectSession(relocatedId);
  await deps.sendMessage(
    buildRelocationPrompt({
      title: source?.title?.trim() || null,
      directory: source?.directory ?? null,
      transcript,
    })
  );
  return relocatedId;
}
