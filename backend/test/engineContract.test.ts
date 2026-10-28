import { describe, expect, it } from 'vitest';
import { toEngineUuid } from '../src/utils/engineIds';
import { toEngineContentType, ValidatedUpload } from '../src/utils/uploadSecurity';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function upload(contentType: string, modality: 'document' | 'audio'): ValidatedUpload {
  return { safeFileName: 'f', extension: '.x', contentType, modality };
}

describe('engine id mapping', () => {
  it('passes UUIDs through and maps other ids to a stable UUIDv5', () => {
    const existing = '336627AF-732e-4349-bda8-b73c702dcf42';
    expect(toEngineUuid(existing)).toBe(existing.toLowerCase());

    const mapped = toEngineUuid('inst-1726000000000');
    expect(mapped).toMatch(UUID);
    expect(toEngineUuid('inst-1726000000000')).toBe(mapped);
    expect(toEngineUuid('inst-1726000000001')).not.toBe(mapped);
  });
});

describe('engine content-type rules (BACKEND_API.md §5)', () => {
  it('accepts PDF and the documented audio types', () => {
    expect(toEngineContentType(upload('application/pdf', 'document'))).toBe('application/pdf');
    expect(toEngineContentType(upload('audio/x-m4a', 'audio'))).toBe('audio/x-m4a');
    expect(toEngineContentType(upload('audio/x-flac', 'audio'))).toBe('audio/flac');
  });

  it('rejects types the engine would permanently fail on', () => {
    const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    expect(() => toEngineContentType(upload(docx, 'document'))).toThrow(/ingested/);
    expect(() => toEngineContentType(upload('text/plain', 'document'))).toThrow();
    expect(() => toEngineContentType(upload('video/mp4', 'document'))).toThrow();
  });
});
