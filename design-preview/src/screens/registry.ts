import type { ScreenDef } from './types';
import { screens as shared } from './shared';
import { screens as student } from './student';
import { screens as kids } from './kids';
import { screens as parent } from './parent';
import { screens as teacher } from './teacher';
import { screens as school } from './school';
import { screens as platform } from './platform';

export const AREAS = [
  { id: 'shared', en: 'Shared', ar: 'مشترك' },
  { id: 'student', en: 'Student (teens and adults)', ar: 'الطالب (يافعون وبالغون)' },
  { id: 'kids', en: 'Kids (under 9)', ar: 'الأطفال (دون 9 سنوات)' },
  { id: 'parent', en: 'Parent', ar: 'ولي الأمر' },
  { id: 'teacher', en: 'Teacher', ar: 'المعلم' },
  { id: 'school', en: 'School admin', ar: 'إدارة المدرسة' },
  { id: 'platform', en: 'Platform admin', ar: 'إدارة المنصة' },
] as const;
export const SCREENS: ScreenDef[] = [...shared, ...student, ...kids, ...parent, ...teacher, ...school, ...platform];
