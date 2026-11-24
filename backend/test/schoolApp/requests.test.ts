import { describe, expect, it } from 'vitest';
import { consentTextHash } from '../../src/schoolApp/requests';
import { headline } from '../../src/schoolApp/emails';

// Parents school app, step (d): the consent text hash (what was agreed to) and the notice headlines.
describe('consent record', () => {
  const form = { title: 'Museum trip', body: 'The class visits the museum on Monday.', options: [{ key: 'agree', label: 'I agree' }, { key: 'decline', label: 'I do not agree' }], deadline: '2026-12-01' };
  it('the hash is stable and changes with any word, option or deadline', () => {
    expect(consentTextHash(form)).toBe(consentTextHash({ ...form }));
    expect(consentTextHash({ ...form, body: form.body + ' ' })).not.toBe(consentTextHash(form));
    expect(consentTextHash({ ...form, options: [form.options[0], { key: 'decline', label: 'No' }] })).not.toBe(consentTextHash(form));
    expect(consentTextHash({ ...form, deadline: '2026-12-02' })).not.toBe(consentTextHash(form));
    expect(consentTextHash({ ...form, bodyAr: 'نص' })).not.toBe(consentTextHash(form));
  });
  it('headlines for request answers and consent forms, English and Arabic', () => {
    expect(headline('request_update', 'en', 'Omar', undefined, 'x', undefined, { requestStatus: 'in_progress' })).toBe('Your request about Omar: in progress');
    expect(headline('request_update', 'ar', 'عمر', undefined, 'x', undefined, { requestStatus: 'done' })).toBe('طلبك بخصوص عمر: تم');
    expect(headline('consent', 'en', 'Omar', '2026-12-01', 'Consent needed: Museum trip')).toBe('Your answer is needed for Omar: Museum trip');
  });
});
