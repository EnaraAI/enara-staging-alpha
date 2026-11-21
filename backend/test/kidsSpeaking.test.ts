import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { kidsSpeakingInfo, kidsSpeakingOn } from '../src/services/kidsSpeaking';

// kidsSpeaking (owner go 21 Nov 2026, VOICE_KIDS_PICTURES_PLAN PR 2): children can speak to the tutor and the avatar. An internal environment
// switch only: no user, teacher or parent setting. Audio is never stored.
afterEach(() => { delete process.env.ENARA_ENGINE_V2; });

describe('kidsSpeaking', () => {
  it('named-only environment switch: off by default and not part of "all"', () => {
    expect(kidsSpeakingOn()).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'all';
    expect(kidsSpeakingOn()).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'kidsSpeaking';
    expect(kidsSpeakingOn()).toBe(true);
  });

  it('the app gets only two booleans (microphone, live call), both from the switch', () => {
    expect(kidsSpeakingInfo()).toEqual({ microphone: false, liveCall: false });
    process.env.ENARA_ENGINE_V2 = 'kidsSpeaking';
    expect(kidsSpeakingInfo()).toEqual({ microphone: true, liveCall: true });
  });

  it('no user setting: the endpoint reads no user, class or parent data', () => {
    const src = readFileSync(join(__dirname, '../src/controllers/tutor.controller.ts'), 'utf8');
    const body = src.slice(src.indexOf('export const getTutorSpeaking'));
    expect(body).toMatch(/res\.json\(kidsSpeakingInfo\(\)\)/);
    expect(body.split('\n').slice(0, 4).join('\n')).not.toMatch(/req\.user|Class|Parent|findOne/);
  });

  it('audio is never stored: the kids chat microphone sends only text; no audio upload in the kids tutor drawer', () => {
    const app = readFileSync(join(__dirname, '../../frontend/kids/KidsApp.tsx'), 'utf8');
    const drawer = app.slice(app.indexOf('function TutorDrawer'));
    expect(drawer).toMatch(/sendRef\.current\(t\)/);
    expect(drawer).not.toMatch(/MediaRecorder|FormData|audioUpload|Blob\(/);
  });
});
