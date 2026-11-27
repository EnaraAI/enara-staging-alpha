import type { ScreenDef } from '../types';
import StudentHome from './StudentHome';
import StudentChat from './StudentChat';
import StudentAvatar from './StudentAvatar';
import StudentAssignment from './StudentAssignment';
import StudentResults from './StudentResults';

export const screens: ScreenDef[] = [
  { id: 'student-home', area: 'student', theme: 'learner', title: { en: 'Student home', ar: 'الصفحة الرئيسية للطالب' }, render: StudentHome },
  { id: 'student-chat', area: 'student', theme: 'learner', title: { en: 'Tutor chat', ar: 'المحادثة مع المعلّم' }, render: StudentChat },
  { id: 'student-avatar', area: 'student', theme: 'learner', title: { en: 'Avatar session', ar: 'جلسة المعلّم المرئي' }, render: StudentAvatar },
  { id: 'student-assignment', area: 'student', theme: 'learner', title: { en: 'Assignment', ar: 'الواجب' }, render: StudentAssignment },
  { id: 'student-results', area: 'student', theme: 'learner', title: { en: 'Results', ar: 'النتائج' }, render: StudentResults },
];
