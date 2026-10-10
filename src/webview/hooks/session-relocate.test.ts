import { describe, expect, it, vi } from 'vitest';
import {
  RELOCATED_TRANSCRIPT_CHAR_LIMIT,
  buildRelocatedSessionTranscript,
  buildRelocationPrompt,
  relocateSessionWithDependencies,
} from './session/session-relocate';
import { fixture } from '../test-fixtures';
import type { MessageEntry, Session } from '../types';

function textEntry(role: 'user' | 'assistant', text: string, id = `${role}-1`): MessageEntry {
  return fixture<MessageEntry>({
    info: { id, sessionID: 'source-1', role },
    parts: [{ type: 'text', text }],
  });
}

function session(overrides: Partial<Session> = {}): Session {
  return fixture<Session>({
    id: 'source-1',
    projectID: 'project-1',
    directory: '/gone',
    title: 'Old work',
    version: '2',
    time: { created: 0, updated: 1 },
    ...overrides,
  });
}

describe('buildRelocatedSessionTranscript', () => {
  it('formats user and assistant turns with text parts', () => {
    const transcript = buildRelocatedSessionTranscript([
      textEntry('user', 'Fix the bug'),
      textEntry('assistant', 'Fixed it'),
    ]);
    expect(transcript).toBe('User:\nFix the bug\n\n---\n\nAssistant:\nFixed it');
  });

  it('skips non-conversation entries and empty text', () => {
    const transcript = buildRelocatedSessionTranscript([
      textEntry('user', '  '),
      fixture<MessageEntry>({
        info: { id: 'tool-1', sessionID: 'source-1', role: 'tool' },
        parts: [{ type: 'text', text: 'tool output' }],
      }),
      textEntry('assistant', 'Done'),
    ]);
    expect(transcript).toBe('Assistant:\nDone');
  });

  it('truncates long transcripts with a marker', () => {
    const transcript = buildRelocatedSessionTranscript([
      textEntry('user', 'x'.repeat(RELOCATED_TRANSCRIPT_CHAR_LIMIT + 10)),
    ]);
    expect(transcript.length).toBeLessThanOrEqual(
      RELOCATED_TRANSCRIPT_CHAR_LIMIT + '\n\n[transcript truncated]'.length
    );
    expect(transcript).toContain('[transcript truncated]');
  });
});

describe('buildRelocationPrompt', () => {
  it('names the source session and folder', () => {
    const prompt = buildRelocationPrompt({
      title: 'Old work',
      directory: '/gone',
      transcript: 'User:\nHi',
    });
    expect(prompt).toContain('"Old work"');
    expect(prompt).toContain('/gone');
    expect(prompt).toContain('User:\nHi');
  });

  it('falls back when no transcript is cached', () => {
    const prompt = buildRelocationPrompt({ title: null, directory: null, transcript: '' });
    expect(prompt).toContain('start fresh');
  });
});

describe('relocateSessionWithDependencies', () => {
  it('creates, selects, and seeds a session in the current workspace', async () => {
    const createSession = vi.fn(async (title?: string) => `new-${title}`);
    const selectSession = vi.fn(async () => true);
    const sendMessage = vi.fn(async (_text: string) => true);
    const deps = {
      getSession: () => session(),
      getSourceMessages: () => [textEntry('user', 'Fix the bug')],
      createSession,
      selectSession,
      sendMessage,
    };

    const relocatedId = await relocateSessionWithDependencies(deps, 'source-1');

    expect(relocatedId).toBe('new-Relocated: Old work');
    expect(createSession).toHaveBeenCalledWith('Relocated: Old work');
    expect(selectSession).toHaveBeenCalledWith('new-Relocated: Old work');
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage.mock.calls[0]?.[0]).toContain('Fix the bug');
  });

  it('throws when no session can be created', async () => {
    const deps = {
      getSession: () => session(),
      getSourceMessages: () => [],
      createSession: vi.fn(async () => null),
      selectSession: vi.fn(async () => true),
      sendMessage: vi.fn(async () => true),
    };
    await expect(relocateSessionWithDependencies(deps, 'source-1')).rejects.toThrow(
      'Could not create a session in the current workspace'
    );
    expect(deps.selectSession).not.toHaveBeenCalled();
  });
});
