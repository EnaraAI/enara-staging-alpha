import type { ScreenDef } from '../types';
import Fees from './B_Fees';
import Bus from './B_Bus';
import Attendance from './B_Attendance';

export const screens: ScreenDef[] = [
  { id: 'parent-fees', area: 'parent', theme: 'learner', title: { en: 'Fees', ar: 'الرسوم' }, render: Fees },
  { id: 'parent-bus', area: 'parent', theme: 'learner', title: { en: 'Bus', ar: 'الحافلة' }, render: Bus },
  { id: 'parent-attendance', area: 'parent', theme: 'learner', title: { en: 'Attendance', ar: 'الحضور' }, render: Attendance },
];
