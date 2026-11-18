import { lmsFlags } from './flags';
import { ACTIVITY_TARGETS, TARGET_PARAM, type PageTargetDef } from './pageTargets';
import { ACTIVITY_PICKER_TYPE, registerPickerType, type PickerItem } from './picker';

// LMS Phase 8 ("more activities, no grade"): three picker plug-ins, one per
// ENARA activity: the AI tutor session, the live avatar session and the
// diagnostic check. Each lists one item whose only custom parameter is the
// Phase 2b page target (enara_target=tutor-session | live-avatar | diagnostic;
// no token, code or id of anyone). None is graded: no lineItem, so ENARA asks
// for no grade column, and the grade outbox never queues anything for a page
// target. (With Moodle's "Accept grades from the tool: Always", Moodle still
// adds an empty column of its own; ENARA never fills it.) The tutor and the
// live avatar use the microphone (needsMedia: the mic badge, a new-window
// request, and ENARA's own "Open in a new tab"); the diagnostic is multiple
// choice and needs no microphone. Offered only while
// LMS_NO_GRADE_ACTIVITIES_ENABLED is on. The launch side is pageTargets.ts
// and activities.ts.

const MEDIA: Record<string, boolean> = { tutor: true, avatar: true, diagnostic: false };

function activityItem(type: string, p: PageTargetDef): PickerItem {
  return {
    type,
    id: p.key,
    title: p.label.en,
    description: p.description.en,
    kind: p.activity,
    graded: false,
    needsMedia: MEDIA[p.activity!] === true,
    custom: { [TARGET_PARAM]: p.key },
    ar: { title: p.label.ar, description: p.description.ar },
    activity: p.activity,
  };
}

const LABELS: Record<string, { en: string; ar: string }> = {
  tutor: { en: 'AI tutor sessions', ar: 'جلسات المعلم الذكي' },
  avatar: { en: 'Live avatar sessions', ar: 'جلسات المعلم المرئي' },
  diagnostic: { en: 'Diagnostic checks', ar: 'الاختبارات التشخيصية' },
};

for (const def of ACTIVITY_TARGETS) {
  const type = ACTIVITY_PICKER_TYPE[def.activity!];
  registerPickerType({
    type,
    label: LABELS[def.activity!],
    enabled: () => lmsFlags().noGradeActivities,
    async list() {
      return [activityItem(type, def)];
    },
    async resolve(_institutionId, id) {
      return id === def.key ? activityItem(type, def) : null;
    },
  });
}
