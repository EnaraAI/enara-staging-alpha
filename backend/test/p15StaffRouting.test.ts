import { describe, expect, it } from 'vitest';
import { SCHOOL_ADMIN_PAGES, staffLandingPage, staffPageAllowed, uiRoleFor } from '../../frontend/services/roleRouting';

// P15 (UI journey defect): a teacher signing in through the staff card landed
// on the school dashboard, whose every data call needs admin rights, and saw
// only "Access denied"; the staff menu also offered other admin-only pages.
// The server already refused them (403) — this keeps teachers out of screens
// they cannot use. Pure functions; no browser.

describe('staff portal routing (frontend services/roleRouting.ts)', () => {
  it('teachers land on their Teaching Dashboard; school admins and ENARA admins on the school dashboard', () => {
    expect(uiRoleFor('teacher', 'admin')).toBe('admin'); // teachers still share the staff portal
    expect(staffLandingPage('teacher')).toBe('teaching');
    expect(staffLandingPage('admin')).toBe('dashboard');
    expect(staffLandingPage('enara-admin')).toBe('dashboard');
  });

  it('teachers never get school-admin pages; teaching pages stay open to them', () => {
    // The pages whose data calls all answered 403 for a teacher in the P15 UI sweep.
    for (const p of ['dashboard', 'live-avatars', 'course-intelligence', 'institution-analytics', 'students', 'credits', 'engagement', 'school-insights', 'learning-events', 'usage', 'savings']) {
      expect(staffPageAllowed('teacher', p), p).toBe(false);
      expect((SCHOOL_ADMIN_PAGES as readonly string[]).includes(p), p).toBe(true);
    }
    for (const p of ['teaching', 'assessment-builder', 'class-assignments', 'grading', 'lesson-planner', 'documents', 'ai-chat', 'outcomes', 'learning-objectives', 'class-insights', 'curriculum', 'assignments']) {
      expect(staffPageAllowed('teacher', p), p).toBe(true);
    }
  });

  it('school admins keep every staff page', () => {
    for (const p of SCHOOL_ADMIN_PAGES) expect(staffPageAllowed('admin', p), p).toBe(true);
  });
});
