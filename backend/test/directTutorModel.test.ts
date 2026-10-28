import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    status = 500;
  }
  class Anthropic {
    static APIError = APIError;
    beta = { messages: { create } };
  }
  return { default: Anthropic };
});

const uploadDir = mkdtempSync(path.join(tmpdir(), 'tutor-uploads-'));
writeFileSync(path.join(uploadDir, 'forces.txt'), 'Newton second law: F = m a.');
vi.mock('../src/config/env', () => ({
  getConfig: () => ({
    anthropicApiKey: 'test-key',
    anthropicTutorModel: 'claude-opus-5-5',
    anthropicVoiceModel: 'claude-haiku-5-5',
    anthropicTutorEffort: 'low',
    uploadDir,
  }),
}));

import { queryDirectTutorModel } from '../src/services/directTutorModel';

describe('direct tutor model', () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({
      stop_reason: 'end_turn',
      model: 'claude-opus-5-5',
      content: [{ type: 'text', text: 'Use F = ma.' }],
    });
  });

  it('sends the curriculum and current lesson materials to Claude', async () => {
    const reply = await queryDirectTutorModel({
      query: 'What is the net force?',
      history: [],
      teachingMethod: 'gap_filler',
      curriculum: {
        courseTitle: 'Physics',
        subject: 'Physics',
        summary: 'Grade 10 mechanics',
        chapters: [
          { id: 'c1', title: 'Kinematics' },
          { id: 'c2', title: "Newton's laws", description: 'Forces and motion' },
        ],
        currentLessonId: 'c2',
        materials: ['/uploads/forces.txt', '/uploads/missing.pdf', '/uploads/image.png'],
      },
    });

    const request = create.mock.calls[0][0];
    const curriculumBlock = request.system[1];
    expect(curriculumBlock.text).toContain("2. Newton's laws (CURRENT LESSON) — Forces and motion");
    expect(curriculumBlock.text).toContain('Summary: Grade 10 mechanics');
    expect(curriculumBlock.cache_control).toEqual({ type: 'ephemeral' });

    // Materials open the conversation (cached); the question is the last turn.
    const [materialsTurn, ack] = request.messages;
    expect(materialsTurn.role).toBe('user');
    expect(materialsTurn.content).toHaveLength(2);
    expect(materialsTurn.content[0]).toMatchObject({
      type: 'document',
      title: 'forces.txt',
      source: { type: 'text', data: 'Newton second law: F = m a.' },
      cache_control: { type: 'ephemeral' },
    });
    expect(ack.role).toBe('assistant');
    expect(request.messages.at(-1)).toEqual({ role: 'user', content: 'What is the net force?' });
    expect(reply).toMatchObject({ answer: 'Use F = ma.', context_found: 2 });
  });

  it('works without a curriculum', async () => {
    await queryDirectTutorModel({ query: 'hi', history: [], teachingMethod: 'socratic' });
    expect(create.mock.calls[0][0].system).toHaveLength(1);
    expect(create.mock.calls[0][0].messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('uses the faster voice model for spoken replies', async () => {
    await queryDirectTutorModel({ query: 'hi', history: [], teachingMethod: 'socratic', mode: 'voice' });
    expect(create.mock.calls[0][0].model).toBe('claude-haiku-5-5');
  });
});
