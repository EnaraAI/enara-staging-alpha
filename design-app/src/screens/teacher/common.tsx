// Shared bits for teacher screens: the AdminShell with teacher navigation, the Grade 9 – B roster, and grading-source badges.
import type { ReactNode } from 'react';
import { BarChart3, Bot, ClipboardCheck, FileText, Lamp, ListChecks, Target, UserCheck, Users } from 'lucide-react';
import { useT } from '@/lib/preview';
import { AdminShell } from '@/components/shell';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

const T = {
  en: { classes: 'Classes', grading: 'Grading', assessments: 'Assessments', errors: 'Errors to work on', reports: 'Reports', school: 'Nile Valley International School', user: 'Ms Dina Ezzat', cls: 'Grade 9 – B' },
  ar: { classes: 'الفصول', grading: 'التصحيح', assessments: 'التقييمات', errors: 'أخطاء للعمل عليها', reports: 'التقارير', school: 'مدرسة وادي النيل الدولية', user: 'أ. دينا عزت', cls: 'الصف التاسع – ب' },
};
export const CLASS_NAME = { en: T.en.cls, ar: T.ar.cls };

export function TeacherShell({ active, title, subtitle, actions, children }: { active: 'classes' | 'grading' | 'assessments' | 'errors' | 'reports'; title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  const t = useT(T);
  const nav = [
    { id: 'classes', label: t.classes, icon: <Users /> },
    { id: 'grading', label: t.grading, icon: <ClipboardCheck />, badge: '14' },
    { id: 'assessments', label: t.assessments, icon: <FileText /> },
    { id: 'errors', label: t.errors, icon: <Target />, badge: '5' },
    { id: 'reports', label: t.reports, icon: <BarChart3 /> },
  ];
  return <AdminShell title={title} subtitle={subtitle} nav={nav} active={active} actions={actions} school={t.school} user={t.user}>{children}</AdminShell>;
}

export type Level = 'A2' | 'A2+' | 'B1' | 'B1+' | 'B2';
export type Flag = 'none' | 'risk' | 'inactive' | 'improving' | 'late';
export interface Learner { id: string; en: string; ar: string; level: Level; active: { en: string; ar: string }; mastery: number; flag: Flag }

const a = (en: string, ar: string) => ({ en, ar });
const today = a('Today', 'اليوم'), yest = a('Yesterday', 'أمس');
const ago = (d: number) => a(`${d} days ago`, d === 2 ? 'منذ يومين' : d <= 10 ? `منذ ${d} أيام` : `منذ ${d} يومًا`);

/** Grade 9 – B, 28 learners. */
export const LEARNERS: Learner[] = [
  { id: 'l01', en: 'Adam Khaled', ar: 'آدم خالد', level: 'B1', active: today, mastery: 74, flag: 'none' },
  { id: 'l02', en: 'Ahmed Samir', ar: 'أحمد سمير', level: 'A2+', active: yest, mastery: 58, flag: 'none' },
  { id: 'l03', en: 'Aly Mostafa', ar: 'علي مصطفى', level: 'B1+', active: today, mastery: 81, flag: 'none' },
  { id: 'l04', en: 'Amira Fathy', ar: 'أميرة فتحي', level: 'B2', active: today, mastery: 92, flag: 'none' },
  { id: 'l05', en: 'Basma Nabil', ar: 'بسمة نبيل', level: 'B1', active: ago(2), mastery: 69, flag: 'none' },
  { id: 'l06', en: 'Farida Hesham', ar: 'فريدة هشام', level: 'B1+', active: today, mastery: 84, flag: 'none' },
  { id: 'l07', en: 'Habiba Tarek', ar: 'حبيبة طارق', level: 'B1', active: today, mastery: 77, flag: 'none' },
  { id: 'l08', en: 'Hana Ashraf', ar: 'هنا أشرف', level: 'B1', active: yest, mastery: 71, flag: 'none' },
  { id: 'l09', en: 'Hassan Wael', ar: 'حسن وائل', level: 'A2', active: ago(4), mastery: 49, flag: 'risk' },
  { id: 'l10', en: 'Jana Sherif', ar: 'جنى شريف', level: 'B2', active: today, mastery: 89, flag: 'none' },
  { id: 'l11', en: 'Karim Adel', ar: 'كريم عادل', level: 'B1', active: yest, mastery: 66, flag: 'none' },
  { id: 'l12', en: 'Laila Mahmoud', ar: 'ليلى محمود', level: 'B1+', active: today, mastery: 80, flag: 'none' },
  { id: 'l13', en: 'Malak Yasser', ar: 'ملك ياسر', level: 'B1', active: today, mastery: 72, flag: 'improving' },
  { id: 'l14', en: 'Mariam Ehab', ar: 'مريم إيهاب', level: 'B1+', active: today, mastery: 83, flag: 'none' },
  { id: 'l15', en: 'Mohamed Gamal', ar: 'محمد جمال', level: 'A2+', active: ago(3), mastery: 57, flag: 'none' },
  { id: 'l16', en: 'Nour Hossam', ar: 'نور حسام', level: 'B1', active: yest, mastery: 70, flag: 'none' },
  { id: 'l17', en: 'Omar Ragab', ar: 'عمر رجب', level: 'A2+', active: yest, mastery: 61, flag: 'none' },
  { id: 'l18', en: 'Rana Magdy', ar: 'رنا مجدي', level: 'B1', active: ago(2), mastery: 63, flag: 'late' },
  { id: 'l19', en: 'Retaj Amr', ar: 'ريتاج عمرو', level: 'B1', active: today, mastery: 75, flag: 'none' },
  { id: 'l20', en: 'Seif Ibrahim', ar: 'سيف إبراهيم', level: 'A2', active: ago(9), mastery: 44, flag: 'inactive' },
  { id: 'l21', en: 'Salma Adel', ar: 'سلمى عادل', level: 'B2', active: today, mastery: 90, flag: 'none' },
  { id: 'l22', en: 'Tamer Fouad', ar: 'تامر فؤاد', level: 'A2+', active: ago(5), mastery: 52, flag: 'risk' },
  { id: 'l23', en: 'Yara Osama', ar: 'يارا أسامة', level: 'B1', active: yest, mastery: 68, flag: 'none' },
  { id: 'l24', en: 'Youssef Hany', ar: 'يوسف هاني', level: 'B1', active: today, mastery: 73, flag: 'none' },
  { id: 'l25', en: 'Zeina Ayman', ar: 'زينة أيمن', level: 'B1+', active: yest, mastery: 79, flag: 'none' },
  { id: 'l26', en: 'Ziad Emad', ar: 'زياد عماد', level: 'A2+', active: ago(2), mastery: 59, flag: 'none' },
  { id: 'l27', en: 'Mostafa Reda', ar: 'مصطفى رضا', level: 'B1', active: today, mastery: 67, flag: 'none' },
  { id: 'l28', en: 'Nada Saeed', ar: 'ندى سعيد', level: 'B1', active: ago(3), mastery: 64, flag: 'none' },
];
export const learner = (id: string) => LEARNERS.find((l) => l.id === id)!;

export type Source = 'mishkat' | 'model' | 'rules' | 'teacher';
const SRC = {
  en: { mishkat: 'Scored by Mishkat', model: 'Scored by the AI model', rules: 'Scored by rules', teacher: 'Teacher override' },
  ar: { mishkat: 'صحّحه مِشكاة', model: 'صحّحه نموذج الذكاء الاصطناعي', rules: 'صُحّح بالقواعد', teacher: 'تعديل المعلم' },
};
const SRC_STYLE: Record<Source, { tone: 'info' | 'outline' | 'neutral' | 'warning'; Icon: typeof Lamp; cls?: string }> = {
  mishkat: { tone: 'info', Icon: Lamp },
  model: { tone: 'outline', Icon: Bot, cls: 'border-chart-4/40 text-chart-4' },
  rules: { tone: 'neutral', Icon: ListChecks },
  teacher: { tone: 'warning', Icon: UserCheck },
};
/** The four grading sources, always shown as a badge next to a score. */
export function SourceBadge({ source, className }: { source: Source; className?: string }) {
  const t = useT(SRC);
  const s = SRC_STYLE[source];
  return <Badge tone={s.tone} className={cn(s.cls, className)}><s.Icon />{t[source]}</Badge>;
}
