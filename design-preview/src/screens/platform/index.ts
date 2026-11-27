import type { ScreenDef } from '../types';
import PlatformSchools from './Schools';
import PlatformUsage from './Usage';
import PlatformModels from './Models';

export const screens: ScreenDef[] = [
  { id: 'platform-schools', area: 'platform', theme: 'admin', title: { en: 'Schools', ar: 'المدارس' }, render: PlatformSchools },
  { id: 'platform-usage', area: 'platform', theme: 'admin', title: { en: 'Usage and budgets', ar: 'الاستخدام والميزانيات' }, render: PlatformUsage },
  { id: 'platform-models', area: 'platform', theme: 'admin', title: { en: 'Mishkat and model status', ar: 'حالة مشكاة والنماذج' }, render: PlatformModels },
];
