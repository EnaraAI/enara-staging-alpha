import { isTeacherOnly, PAGE_TARGETS, pageTargetDef, TARGET_PARAM, type PageTargetDef } from './pageTargets';
import { COURSE_LINK_TYPE, PAGE_TYPE, registerPickerType, type PickerItem } from './picker';

// Phase 2b: page targets as picker plug-ins (no change to the picker screen,
// its API or the signed response). Two types:
//   - "ENARA home (course link)" (owner decision D12): one role-routed ENARA
//     link for everyone in the course, custom { enara_target: 'home' };
//   - "ENARA pages": a direct link to one page (My progress, Grading, ...),
//     custom { enara_target: '<page key>' }. Teacher-only pages carry
//     teacherOnly (the picker's "Teachers only" badge).
// None is graded: no grade column (no lineItem), and the grade outbox never
// queues anything for a page link. The launch side is pageTargets.ts.

function pageItem(type: string, p: PageTargetDef): PickerItem {
  return {
    type,
    id: p.key,
    title: p.label.en,
    description: p.description.en,
    kind: 'page',
    graded: false,
    needsMedia: false,
    custom: { [TARGET_PARAM]: p.key },
    ar: { title: p.label.ar, description: p.description.ar },
    ...(isTeacherOnly(p) ? { teacherOnly: true } : {}),
  };
}

registerPickerType({
  type: COURSE_LINK_TYPE,
  label: { en: 'ENARA home (course link)', ar: 'الصفحة الرئيسية لإنارة (رابط المقرر)' },
  async list() {
    return [pageItem(COURSE_LINK_TYPE, pageTargetDef('home')!)];
  },
  async resolve(_institutionId, id) {
    return id === 'home' ? pageItem(COURSE_LINK_TYPE, pageTargetDef('home')!) : null;
  },
});

registerPickerType({
  type: PAGE_TYPE,
  label: { en: 'ENARA pages', ar: 'صفحات إنارة' },
  async list() {
    return PAGE_TARGETS.filter((p) => p.key !== 'home').map((p) => pageItem(PAGE_TYPE, p));
  },
  async resolve(_institutionId, id) {
    const p = id !== 'home' ? pageTargetDef(id) : undefined;
    return p ? pageItem(PAGE_TYPE, p) : null;
  },
});
