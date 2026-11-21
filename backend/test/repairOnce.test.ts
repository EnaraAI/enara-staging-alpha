import { afterEach, describe, expect, it } from 'vitest';
import { hasTrustedMarker, MISSING_MARKER_NOTE, needsRepair, repairOnceOn } from '../src/services/repairOnce';
import { stripAssessmentMarkers } from '../src/services/languageLearningState';

// repairOnce (owner go 21 Nov 2026, ARCH_ADOPTION_PLAN H): one bounded regeneration when the hidden grading line is missing.
afterEach(() => { delete process.env.ENARA_ENGINE_V2; });
const good = stripAssessmentMarkers('[[assess verdict=CORRECT relevance=ACTIVE_ITEM next=NEW_ITEM]]\nYes! Next: 6 x 7?');
const missing = stripAssessmentMarkers('Yes! Next: 6 x 7?');
const trailing = stripAssessmentMarkers('Yes! [[assess verdict=CORRECT relevance=ACTIVE_ITEM next=NONE]]');

describe('repairOnce', () => {
  it('named-only switch, off by default', () => {
    expect(repairOnceOn()).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'all';
    expect(repairOnceOn()).toBe(false);
  });

  it('only a leading marker is trusted', () => {
    expect(hasTrustedMarker(good)).toBe(true);
    expect(hasTrustedMarker(missing)).toBe(false);
    expect(hasTrustedMarker(trailing)).toBe(false);
  });

  it('repairs only a graded turn with no trusted line, once, and never after the answer-leak regeneration', () => {
    const p = { gradedTurn: true, marker: missing, alreadyRegenerated: false, text: 'Yes!' };
    expect(needsRepair(p)).toBe(false); // switch off
    process.env.ENARA_ENGINE_V2 = 'repairOnce';
    expect(needsRepair(p)).toBe(true);
    expect(needsRepair({ ...p, marker: good })).toBe(false);
    expect(needsRepair({ ...p, gradedTurn: false })).toBe(false);
    expect(needsRepair({ ...p, alreadyRegenerated: true })).toBe(false);
    expect(needsRepair({ ...p, text: '' })).toBe(false);
  });

  it('the note names the reason and asks for no other change', () => {
    expect(MISSING_MARKER_NOTE).toMatch(/hidden grading line/);
    expect(MISSING_MARKER_NOTE).toMatch(/Change nothing else/);
  });
});
