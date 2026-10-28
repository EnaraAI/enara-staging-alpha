import React, { useState, useEffect } from 'react';
import { 
  Users, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Target, 
  Award, 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  ChevronRight, 
  AlertCircle, 
  MoreHorizontal,
  Plus,
  PlusCircle,
  FileText,
  Zap,
  Building2,
  CheckCircle2,
  Layers,
  Copy,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Calendar,
  Globe,
  Monitor,
  LayoutDashboard,
  BarChart3,
  ShieldCheck,
  Activity,
  DollarSign,
  PieChart as PieChartIcon,
  Briefcase,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  SearchCheck,
  Cpu,
  MousePointer2,
  History,
  ChevronDown,
  Bell,
  X,
  Settings,
  CreditCard,
  Ban,
  RotateCcw,
  Database,
  UserCheck,
  Trash2,
  Mail,
  Shield
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
  Scatter
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { createUserAccount, fetchStudents, BackendRole } from '../services/apiService';
import { toast } from '../services/toastService';

// Random initial password (backend requires 8+ characters); shown once after creation.
const generateAdminPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
  const buf = new Uint32Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf, n => chars[n % chars.length]).join('');
};

// fetchStudents returns one page (backend default page size 50).
const STUDENT_PAGE_SIZE = 50;

type FirestoreAdminRecord = {
  id: string;
  firestoreDocId?: string;
  name: string;
  email: string;
  role: 'admin' | 'enara-admin' | 'institution-admin';
  institution: string;
  department: string;
  status: string;
  registeredBy: string;
  registeredAt: string;
  phone?: string;
};

// --- Mock Data ---

const EXECUTIVE_KPIS = [
  { id: 'institutions', label: 'Partner Institutions', value: '482', change: '+12', status: 'success', trend: [400, 410, 425, 440, 460, 482] },
  { id: 'students', label: 'Enrolled Students', value: '1.2M', change: '+8.1%', status: 'success', trend: [1.0, 1.05, 1.1, 1.12, 1.15, 1.2] },
  { id: 'mau', label: 'Monthly Active Students', value: '842k', change: '+12.4%', status: 'success', trend: [700, 720, 750, 780, 810, 842] },
  { id: 'completion', label: 'Course Completion', value: '78.5%', change: '-1.2%', status: 'warning', trend: [80, 79.5, 79, 78.8, 78.6, 78.5] },
  { id: 'engagement', label: 'Avg Engagement Score', value: '8.4', change: '+0.2', status: 'success', trend: [8.0, 8.1, 8.2, 8.2, 8.3, 8.4] },
  { id: 'at_risk', label: 'At-Risk Students', value: '12,492', change: '+420', status: 'danger', trend: [10000, 10500, 11000, 11500, 12000, 12492] },
  { id: 'interventions', label: 'Open Interventions', value: '842', change: '-12%', status: 'success', trend: [1000, 950, 920, 890, 860, 842] },
  { id: 'ai_sessions', label: 'Active AI Sessions', value: '42.1k', change: '+24%', status: 'success', trend: [30, 32, 35, 38, 40, 42.1] },
  { id: 'uptime', label: 'Platform Uptime', value: '99.98%', change: 'Stable', status: 'success', trend: [99.9, 99.95, 99.98, 99.98, 99.98, 99.98] },
  { id: 'partner_credits', label: 'Total Partner Credits', value: '2.4M', change: '+120k', status: 'success', trend: [2.0, 2.1, 2.2, 2.3, 2.35, 2.4] },
];

const GROWTH_DATA = [
  { name: 'Sep', students: 0.9, institutions: 380, mau: 650, churn: 0.8, retention: 92 },
  { name: 'Oct', students: 0.95, institutions: 405, mau: 680, churn: 0.7, retention: 93 },
  { name: 'Nov', students: 1.02, institutions: 420, mau: 720, churn: 0.6, retention: 93.5 },
  { name: 'Dec', students: 1.05, institutions: 435, mau: 700, churn: 0.9, retention: 92.8 },
  { name: 'Jan', students: 1.12, institutions: 455, mau: 790, churn: 0.5, retention: 94 },
  { name: 'Feb', students: 1.18, institutions: 470, mau: 820, churn: 0.4, retention: 94.2 },
  { name: 'Mar', students: 1.2, institutions: 482, mau: 842, churn: 0.4, retention: 94.2 },
];

const INSTITUTION_PERFORMANCE = [
  { name: 'Global Tech Academy', students: '42.5k', active: '38.2k', retention: '96.4%', completion: '82.1%', engagement: 8.8, risk: 'Low', credits: '842k', hoursSaved: '12,450', status: 'Healthy', lastActive: '2m ago' },
  { name: 'Future Skills Inst.', students: '28.4k', active: '24.1k', retention: '92.1%', completion: '74.5%', engagement: 7.9, risk: 'Medium', credits: '124k', hoursSaved: '8,210', status: 'Warning', lastActive: '15m ago' },
  { name: 'Elite Learning Corp', students: '18.2k', active: '16.8k', retention: '98.2%', completion: '88.4%', engagement: 9.2, risk: 'Low', credits: '450k', hoursSaved: '6,840', status: 'Healthy', lastActive: '5m ago' },
  { name: 'Standard University', students: '32.1k', active: '22.4k', retention: '84.5%', completion: '62.8%', engagement: 6.4, risk: 'High', credits: '12k', hoursSaved: '4,120', status: 'At Risk', lastActive: '1h ago' },
  { name: 'Creative Arts Hub', students: '12.4k', active: '10.2k', retention: '91.2%', completion: '76.2%', engagement: 8.1, risk: 'Low', credits: '210k', hoursSaved: '3,950', status: 'Healthy', lastActive: '12m ago' },
];

const BRANCH_PERFORMANCE = [
  { name: 'Cairo Central', institution: 'Global Tech', health: 94, trend: 'up', students: 4200 },
  { name: 'Dubai North', institution: 'Elite Learning', health: 92, trend: 'up', students: 2800 },
  { name: 'Riyadh East', institution: 'Future Skills', health: 72, trend: 'down', students: 3100 },
  { name: 'London West', institution: 'Standard Uni', health: 58, trend: 'down', students: 1200 },
  { name: 'Amman South', institution: 'Global Tech', health: 88, trend: 'stable', students: 1500 },
];

const RISK_CATEGORIES = [
  { name: 'High Risk', value: 2492, color: '#ef4444' },
  { name: 'Medium Risk', value: 4200, color: '#f59e0b' },
  { name: 'Low Risk', value: 5800, color: '#10b981' },
];

const AI_ANALYTICS = [
  { name: 'AI Tutor Sessions', value: '428k', trend: '+18%' },
  { name: 'Avg Session Duration', value: '14.2m', trend: '+4%' },
  { name: 'Daily Active Usage', value: '84%', trend: '+2%' },
  { name: 'Response Satisfaction', value: '4.8/5', trend: '+0.1' },
];

const AI_TECHNICAL_METRICS = [
  { name: 'Avg RAG Confidence Score', value: '0.92', trend: '+0.03', status: 'success' },
  { name: 'Out-of-Scope Query Rate', value: '4.2%', trend: '-0.8%', status: 'success' },
  { name: 'Avg Response Latency', value: '420ms', trend: '-15ms', status: 'success' },
  { name: 'Error Rate %', value: '0.12%', trend: '-0.05%', status: 'success' },
  { name: 'Time-to-First-Audio (TTFA)', value: '180ms', trend: '-20ms', status: 'success' },
  { name: 'STT Fallback Rate', value: '1.8%', trend: '+0.2%', status: 'warning' },
  { name: 'Barge-in / Interruption Rate', value: '12.4%', trend: '+1.5%', status: 'info' },
  { name: 'AI Question Discrimination Index', value: '0.88', trend: '+0.05', status: 'success' },
  { name: 'Hallucination Rate', value: '0.04%', trend: '-0.01%', status: 'success' },
  { name: 'Retrieval Precision', value: '94.8%', trend: '+1.2%', status: 'success' },
];

const SALES_PIPELINE = [
  { label: 'New Leads', value: '42', change: '+8' },
  { label: 'In Pilot', value: '18', change: '+3' },
  { label: 'Pilot Conversion', value: '64%', change: '+5%' },
];

const PARTNER_CREDITS_MANAGEMENT = [
  { id: 'gt-01', name: 'Global Tech Academy', total: '1.2M', used: '358k', remaining: '842k', status: 'Healthy', lastTopUp: '12 days ago', plan: 'Enterprise', nextRenewal: '2026-05-15' },
  { id: 'fs-01', name: 'Future Skills Inst.', total: '500k', used: '376k', remaining: '124k', status: 'Warning', lastTopUp: '45 days ago', plan: 'Pro', nextRenewal: '2026-04-20' },
  { id: 'el-01', name: 'Elite Learning Corp', total: '800k', used: '350k', remaining: '450k', status: 'Healthy', lastTopUp: '5 days ago', plan: 'Enterprise', nextRenewal: '2026-06-01' },
  { id: 'su-01', name: 'Standard University', total: '200k', used: '188k', remaining: '12k', status: 'Critical', lastTopUp: '60 days ago', plan: 'Basic', nextRenewal: '2026-04-10' },
  { id: 'ca-01', name: 'Creative Arts Hub', total: '300k', used: '90k', remaining: '210k', status: 'Healthy', lastTopUp: '20 days ago', plan: 'Pro', nextRenewal: '2026-05-01' },
];

const ALERTS = [
  { id: 2, type: 'warning', title: 'Product Issue', message: 'AI Latency spike in EMEA region (>800ms)', time: '45m ago' },
  { id: 3, type: 'info', title: 'Pilot Deadline', message: 'Future Skills pilot ends in 3 days', time: '2h ago' },
  { id: 4, type: 'success', title: 'Expansion', message: 'Global Tech Academy added 5,000 seats', time: '4h ago' },
  { id: 5, type: 'danger', title: 'Critical Drop', message: 'Riyadh East branch attendance drop (-22%)', time: '6h ago' },
];

// --- Components ---

const SampleBadge: React.FC = () => (
  <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-800">
    Sample data
  </span>
);

const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`bg-white border border-slate-200 rounded-xl ${className}`}>{children}</div>
);

const KPICard: React.FC<{ kpi: typeof EXECUTIVE_KPIS[0] }> = ({ kpi }) => {
  const isPositive = kpi.change.startsWith('+') || kpi.change === 'Stable';
  const warn = kpi.status === 'danger';
  return (
    <div className={`rounded-xl border p-5 ${warn ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200'}`}>
      <p className={`text-sm ${warn ? 'text-orange-800' : 'text-slate-600'}`}>{kpi.label}</p>
      <p className={`mt-1 text-3xl font-extrabold ${warn ? 'text-orange-800' : 'text-slate-900'}`}>{kpi.value}</p>
      {kpi.change ? (
        <p className="mt-1 text-xs text-slate-600">
          <span className={`font-bold ${isPositive ? 'text-green-700' : 'text-rose-700'}`}>{kpi.change}</span> vs last month
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-600">From student records</p>
      )}
    </div>
  );
};

const SectionHeader: React.FC<{ title: string; subtitle?: string; action?: React.ReactNode; sample?: boolean }> = ({ title, subtitle, action, sample }) => (
  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {sample && <SampleBadge />}
      </div>
      {subtitle && <p className="text-sm text-slate-600 mt-0.5">{subtitle}</p>}
    </div>
    {action}
  </div>
);

const TH = 'px-4 py-3 font-semibold';
const pill = (tone: 'green' | 'amber' | 'red' | 'blue') =>
  `inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
    tone === 'green' ? 'bg-green-50 text-green-700' :
    tone === 'amber' ? 'bg-amber-50 text-amber-800' :
    tone === 'red' ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'
  }`;
const inputCls = 'w-full h-10 px-3 bg-white border border-slate-300 rounded-md text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20';
const labelCls = 'block text-sm font-semibold text-slate-700 mb-1';
const tooltipStyle = { borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: 'none', fontSize: 12 };
const axisTick = { fill: '#52525b', fontSize: 12 };

interface EnaraAdminDashboardProps {
  onNavigate?: (tab: string) => void;
}

export const EnaraAdminDashboard: React.FC<EnaraAdminDashboardProps> = ({ onNavigate }) => {
  const [isAlertPanelOpen, setIsAlertPanelOpen] = useState(true);
  const [selectedPartnerForCredits, setSelectedPartnerForCredits] = useState<typeof PARTNER_CREDITS_MANAGEMENT[0] | null>(null);
  const [topUpAmount, setTopUpAmount] = useState('100000');

  // Administrator Firestore Database State
  const [adminsList, setAdminsList] = useState<FirestoreAdminRecord[]>([]);
  const [isRegisterAdminModalOpen, setIsRegisterAdminModalOpen] = useState(false);
  const [isSubmittingAdmin, setIsSubmittingAdmin] = useState(false);
  const [adminFormSuccess, setAdminFormSuccess] = useState(false);
  const [newAdmin, setNewAdmin] = useState<{
    name: string;
    email: string;
    role: 'admin' | 'enara-admin' | 'institution-admin';
    institution: string;
    department: string;
    phone: string;
  }>({
    name: '',
    email: '',
    role: 'admin',
    institution: '',
    department: 'Academic Affairs',
    phone: ''
  });

  const [createdAdminPassword, setCreatedAdminPassword] = useState<string | null>(null);
  const [studentCount, setStudentCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStudents()
      .then(list => { if (!cancelled) setStudentCount(list.length); })
      .catch(err => { if (!cancelled) toast.error('Could not load students', err instanceof Error ? err.message : 'Unexpected error'); });
    return () => { cancelled = true; };
  }, []);

  // The enrolled-students KPI comes from the backend; the other KPIs are sample data.
  const executiveKpis = EXECUTIVE_KPIS.map(kpi => kpi.id === 'students'
    ? {
        ...kpi,
        value: studentCount === null ? '—' : `${studentCount.toLocaleString()}${studentCount >= STUDENT_PAGE_SIZE ? '+' : ''}`,
        change: '',
        trend: [],
      }
    : kpi);

  const closeRegisterAdminModal = () => {
    setIsRegisterAdminModalOpen(false);
    setAdminFormSuccess(false);
    setCreatedAdminPassword(null);
    setNewAdmin({
      name: '',
      email: '',
      role: 'admin',
      institution: '',
      department: 'Academic Affairs',
      phone: ''
    });
  };

  const handleRegisterAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdmin.name || !newAdmin.email) return;

    setIsSubmittingAdmin(true);
    // 'institution-admin' (Academic Director) has no backend role of its own; it is an admin login.
    const role: BackendRole = newAdmin.role === 'enara-admin' ? 'enara-admin' : 'admin';
    const password = generateAdminPassword();
    try {
      await createUserAccount({
        email: newAdmin.email.trim(),
        password,
        name: newAdmin.name.trim(),
        role,
        institutionId: newAdmin.institution.trim() || undefined,
      });
      // The backend has no endpoint to list admin accounts, so this list only shows admins added in this session.
      setAdminsList(prev => [...prev, {
        id: Date.now().toString(),
        name: newAdmin.name,
        email: newAdmin.email,
        role: newAdmin.role,
        institution: newAdmin.institution,
        department: newAdmin.department,
        status: 'active',
        registeredBy: 'Enara Super Administrator',
        registeredAt: new Date().toISOString(),
        phone: newAdmin.phone
      }]);
      setCreatedAdminPassword(password);
      setAdminFormSuccess(true);
    } catch (error) {
      toast.error('Could not create administrator', error instanceof Error ? error.message : 'Unexpected error');
    } finally {
      setIsSubmittingAdmin(false);
    }
  };

const handleDeleteAdmin = async (id?: string) => {
    if (!id) return;
    if (confirm("Are you sure you want to remove this administrator?")) {
      setAdminsList(prev => prev.filter(a => a.id !== id));
    }
  };

  return (
    <div className="min-h-full bg-[#f5f7fa]">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6">

        {/* Page header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-teal-700">Enara executive</p>
            <h1 className="text-3xl font-extrabold text-slate-900">Platform overview</h1>
            <p className="text-slate-600 mt-1">All partner institutions · last 30 days</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsRegisterAdminModalOpen(true)}
              className="inline-flex items-center gap-2 h-10 px-4 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 rounded-md text-sm font-semibold"
            >
              <UserCheck size={16} /> Register administrator
            </button>
            <button className="inline-flex items-center gap-2 h-10 px-4 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 rounded-md text-sm font-semibold">
              <Download size={16} /> Export report
            </button>
            <button
              onClick={() => onNavigate?.('integrations')}
              className="inline-flex items-center gap-2 h-10 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-sm font-bold"
            >
              <PlusCircle size={16} /> Add partner
            </button>
          </div>
        </div>

        {/* KPI row */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="sr-only">Key metrics</h2>
            <SampleBadge />
            <span className="text-xs text-slate-600">Enrolled students is live; other figures are sample data.</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {executiveKpis.map(kpi => (
              <KPICard key={kpi.id} kpi={kpi} />
            ))}
          </div>
        </section>

        {/* Institutions table */}
        <Card className="overflow-hidden">
          <div className="px-6 pt-5">
            <SectionHeader
              title="Institutions"
              subtitle="Ranked performance of partner institutions."
              sample
              action={
                <div className="flex items-center gap-3">
                  <div className="relative hidden sm:block">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input type="text" aria-label="Filter partners" placeholder="Filter partners..." className="h-9 pl-8 pr-3 bg-white border border-slate-300 rounded-md text-sm outline-none w-48 focus:border-teal-600" />
                  </div>
                  <button onClick={() => onNavigate?.('integrations')} className="text-sm text-teal-700 font-semibold hover:underline">Onboard institution</button>
                </div>
              }
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[760px]">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-3 font-semibold">Institution</th>
                  <th className={TH}>Students</th>
                  <th className={TH}>Active</th>
                  <th className={TH}>Credits rem.</th>
                  <th className={TH}>Hours saved</th>
                  <th className={TH}>Engagement</th>
                  <th className={TH}>Status</th>
                </tr>
              </thead>
              <tbody>
                {INSTITUTION_PERFORMANCE.map((inst, i) => (
                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-6 py-3.5">
                      <p className="font-semibold text-slate-900">{inst.name}</p>
                      <p className="text-xs text-slate-600">Last active {inst.lastActive}</p>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">{inst.students}</td>
                    <td className="px-4 py-3.5 text-slate-700">{inst.active}</td>
                    <td className={`px-4 py-3.5 font-semibold ${parseInt(inst.credits) < 50 ? 'text-rose-700' : 'text-slate-700'}`}>{inst.credits}</td>
                    <td className="px-4 py-3.5 text-slate-700">{inst.hoursSaved}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-2 bg-[#eef1f6] rounded-full overflow-hidden">
                          <div className="h-full bg-[#0056D2] rounded-full" style={{ width: `${inst.engagement * 10}%` }} />
                        </div>
                        <span className="text-slate-700">{inst.engagement}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={pill(inst.status === 'Healthy' ? 'green' : inst.status === 'Warning' ? 'amber' : 'red')}>{inst.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Growth + retention */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <Card className="xl:col-span-2 p-6">
            <SectionHeader title="Student growth" subtitle="Enrolled students (millions) over the last 7 months." sample />
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={GROWTH_DATA}>
                  <CartesianGrid vertical={false} stroke="#eef1f6" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={axisTick} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={axisTick} width={40} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="students" name="Students (M)" stroke="#0056D2" strokeWidth={2.5} dot={{ r: 3, fill: '#0056D2' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-6">
            <SectionHeader title="Retention & churn" subtitle="User lifecycle health." sample />
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={GROWTH_DATA}>
                  <CartesianGrid vertical={false} stroke="#eef1f6" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={axisTick} />
                  <YAxis axisLine={false} tickLine={false} tick={axisTick} width={32} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="retention" name="Retention %" fill="#bcd3f7" radius={[4, 4, 0, 0]} barSize={22} />
                  <Line type="monotone" dataKey="churn" name="Churn %" stroke="#d97706" strokeWidth={2} dot={{ r: 3, fill: '#d97706' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-5 space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-slate-600">Net revenue retention</span>
                  <span className="font-bold text-slate-900">118%</span>
                </div>
                <div className="h-2.5 w-full bg-[#eef1f6] rounded-full overflow-hidden">
                  <div className="h-full bg-[#0056D2] rounded-full" style={{ width: '100%' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-slate-600">Monthly logo churn</span>
                  <span className="font-bold text-slate-900">0.4%</span>
                </div>
                <div className="h-2.5 w-full bg-[#eef1f6] rounded-full overflow-hidden">
                  <div className="h-full bg-[#d97706] rounded-full" style={{ width: '4%' }} />
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Product usage + needs attention */}
        <div className="flex flex-wrap gap-5">
          <Card className="flex-[1_1_420px] p-6">
            <SectionHeader title="Product & AI usage" subtitle="System interaction volume." sample />
            <div className="divide-y divide-slate-100">
              {AI_ANALYTICS.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-3">
                  <span className="text-slate-700">{item.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="font-bold text-slate-900">{item.value}</span>
                    <span className="text-xs font-bold text-green-700">{item.trend}</span>
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between py-3">
                <span className="text-slate-700">Avg latency</span>
                <span className="font-bold text-slate-900">420ms</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-slate-700">Curriculum coverage</span>
                <span className="font-bold text-slate-900">92.4%</span>
              </div>
            </div>
          </Card>

          <Card className="flex-[1_1_420px] p-6">
            <SectionHeader title="Needs attention" sample />
            <ul className="divide-y divide-slate-100">
              {ALERTS.map(alert => (
                <li key={alert.id} className="flex items-start justify-between gap-3 py-3">
                  <div>
                    <span className={pill(alert.type === 'danger' ? 'red' : alert.type === 'warning' ? 'amber' : alert.type === 'success' ? 'green' : 'blue')}>{alert.title}</span>
                    <p className="text-slate-800 mt-1.5">{alert.message}</p>
                  </div>
                  <span className="text-xs text-slate-600 whitespace-nowrap">{alert.time}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Student risk */}
        <Card className="p-6">
          <SectionHeader title="Student risk" subtitle="Predicted learner risk and intervention outcomes." sample />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-center">
            <div className="grid grid-cols-2 md:grid-cols-1 gap-4">
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                <p className="text-sm text-orange-800">Total at-risk</p>
                <p className="text-3xl font-extrabold text-orange-800 mt-1">12,492</p>
                <p className="text-xs text-orange-800 mt-1">+420 this week</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-sm text-slate-600">Intervention success</p>
                <p className="text-3xl font-extrabold text-slate-900 mt-1">84.2%</p>
                <p className="text-xs text-slate-600 mt-1">+2.1% efficiency</p>
              </div>
            </div>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={RISK_CATEGORIES} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={2} dataKey="value">
                    {RISK_CATEGORIES.map((entry, index) => (
                      <Cell key={`enara-admin-cell-${index}`} fill={['#b91c1c', '#d97706', '#15803d'][index] || entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-3">
              {RISK_CATEGORIES.map((cat, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-700">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ['#b91c1c', '#d97706', '#15803d'][i] || cat.color }} />
                    {cat.name}
                  </span>
                  <span className="font-bold text-slate-900">{cat.value.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        {/* AI technical metrics */}
        <section>
          <SectionHeader title="AI model health" subtitle="RAG, latency and reliability metrics." sample />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {AI_TECHNICAL_METRICS.map((metric, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-sm text-slate-600 leading-snug min-h-[2.5rem]">{metric.name}</p>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">{metric.value}</p>
                <p className={`text-xs font-bold mt-1 ${
                  metric.trend.startsWith('-') && metric.name.includes('Rate') || metric.name.includes('Latency') || metric.name.includes('TTFA') ? 'text-green-700' :
                  metric.trend.startsWith('+') && !metric.name.includes('Rate') && !metric.name.includes('Latency') ? 'text-green-700' : 'text-rose-700'
                }`}>
                  {metric.trend}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Deep-dive links */}
        <section>
          <SectionHeader title="Deep-dive analytics" subtitle="Drill into specific operational domains." />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { id: 'institutions', label: 'Institution details', icon: Building2 },
              { id: 'institutions', label: 'Branch breakdown', icon: Layers },
              { id: 'roi', label: 'Student risk model', icon: SearchCheck },
              { id: 'health', label: 'Product analytics', icon: Monitor },
              { id: 'audit', label: 'Admin activity', icon: History },
            ].map((item, i) => (
              <button
                key={i}
                onClick={() => onNavigate?.(item.id)}
                className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:border-teal-600 text-left"
              >
                <item.icon size={20} className="text-teal-700 shrink-0" />
                <span className="text-sm font-semibold text-slate-800">{item.label}</span>
                <ChevronRight size={16} className="ml-auto text-slate-500" />
              </button>
            ))}
          </div>
        </section>

        {/* Partner credits */}
        <Card className="overflow-hidden">
          <div className="px-6 pt-5">
            <SectionHeader title="Partner credits" subtitle="AI credit distribution across partner institutions." sample />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[900px]">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-3 font-semibold">Partner institution</th>
                  <th className={TH}>Total</th>
                  <th className={TH}>Used</th>
                  <th className={TH}>Remaining</th>
                  <th className={TH}>Usage</th>
                  <th className={TH}>Last top-up</th>
                  <th className={TH}>Status</th>
                  <th className={TH}><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {PARTNER_CREDITS_MANAGEMENT.map((partner, i) => {
                  const usedNum = parseFloat(partner.used);
                  const totalNum = parseFloat(partner.total);
                  const usagePct = (usedNum / totalNum) * 100;

                  return (
                    <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-6 py-3.5">
                        <p className="font-semibold text-slate-900">{partner.name}</p>
                        <p className="text-xs text-slate-600">{partner.plan} plan</p>
                      </td>
                      <td className="px-4 py-3.5 text-slate-700">{partner.total}</td>
                      <td className="px-4 py-3.5 text-slate-700">{partner.used}</td>
                      <td className={`px-4 py-3.5 font-semibold ${partner.status === 'Critical' ? 'text-rose-700' : 'text-slate-900'}`}>{partner.remaining}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-[#eef1f6] rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${usagePct > 80 ? 'bg-rose-600' : usagePct > 50 ? 'bg-[#d97706]' : 'bg-[#0056D2]'}`} style={{ width: `${usagePct}%` }} />
                          </div>
                          <span className="text-xs text-slate-600">{Math.round(usagePct)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-slate-700">{partner.lastTopUp}</p>
                        <p className="text-xs text-slate-600">Renews {partner.nextRenewal}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={pill(partner.status === 'Healthy' ? 'green' : partner.status === 'Warning' ? 'amber' : 'red')}>{partner.status}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button onClick={() => setSelectedPartnerForCredits(partner)} className="text-teal-700 font-semibold hover:underline">
                          Manage
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Administrators */}
        <Card className="overflow-hidden">
          <div className="px-6 pt-5">
            <SectionHeader
              title="Administrators"
              subtitle="Administrator logins created in this session."
              action={
                <button
                  onClick={() => setIsRegisterAdminModalOpen(true)}
                  className="inline-flex items-center gap-2 h-10 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-sm font-bold"
                >
                  <UserCheck size={16} /> Register administrator
                </button>
              }
            />
          </div>
          {adminsList.length === 0 ? (
            <div className="px-6 pb-10 pt-4 text-center">
              <Shield size={28} className="mx-auto text-slate-400" />
              <h3 className="mt-3 font-bold text-slate-900">No administrators registered yet</h3>
              <p className="text-sm text-slate-600 max-w-md mx-auto mt-1">
                As an Enara administrator, you can create logins for institution admins.
              </p>
              <button
                onClick={() => setIsRegisterAdminModalOpen(true)}
                className="mt-4 text-sm text-teal-700 font-semibold hover:underline inline-flex items-center gap-1"
              >
                <Plus size={16} /> Register first administrator
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[800px]">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-6 py-3 font-semibold">Administrator</th>
                    <th className={TH}>Role</th>
                    <th className={TH}>Institution</th>
                    <th className={TH}>Department</th>
                    <th className={TH}>Registered</th>
                    <th className={TH}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {adminsList.map((adm) => (
                    <tr key={adm.id} className="border-t border-slate-100">
                      <td className="px-6 py-3.5">
                        <p className="font-semibold text-slate-900">{adm.name}</p>
                        <p className="text-xs text-slate-600">{adm.email}</p>
                      </td>
                      <td className="px-4 py-3.5"><span className={pill('blue')}>{adm.role}</span></td>
                      <td className="px-4 py-3.5 text-slate-700">{adm.institution}</td>
                      <td className="px-4 py-3.5 text-slate-700">{adm.department}</td>
                      <td className="px-4 py-3.5 text-slate-700">{new Date(adm.registeredAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => handleDeleteAdmin(adm.id)}
                          className="p-2 text-rose-700 hover:bg-rose-50 rounded-md"
                          title="Revoke administrator access"
                          aria-label={`Remove ${adm.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* AI Credit Management Modal */}
      <AnimatePresence>
        {selectedPartnerForCredits && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPartnerForCredits(null)}
              className="absolute inset-0 bg-slate-900/50"
            />
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-2xl bg-white rounded-xl border border-slate-200 overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">AI credit management</h3>
                  <p className="text-sm text-slate-600">{selectedPartnerForCredits.name} · {selectedPartnerForCredits.plan} plan</p>
                </div>
                <button
                  onClick={() => setSelectedPartnerForCredits(null)}
                  aria-label="Close"
                  className="p-2 hover:bg-slate-100 rounded-md text-slate-600"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 rounded-xl border border-slate-200">
                    <p className="text-sm text-slate-600">Total allocated</p>
                    <p className="text-2xl font-extrabold text-slate-900">{selectedPartnerForCredits.total}</p>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200">
                    <p className="text-sm text-slate-600">Used</p>
                    <p className="text-2xl font-extrabold text-slate-900">{selectedPartnerForCredits.used}</p>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200">
                    <p className="text-sm text-slate-600">Remaining</p>
                    <p className="text-2xl font-extrabold text-teal-700">{selectedPartnerForCredits.remaining}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap justify-between gap-2 text-sm">
                    <h4 className="font-semibold text-slate-800">Consumption</h4>
                    <span className="text-slate-600">Next renewal: {selectedPartnerForCredits.nextRenewal}</span>
                  </div>
                  <div className="h-3 w-full bg-[#eef1f6] rounded-full overflow-hidden flex">
                    <div className="h-full bg-[#0056D2]" style={{ width: '30%' }} />
                    <div className="h-full bg-[#bcd3f7]" style={{ width: '15%' }} />
                  </div>
                  <div className="flex gap-4 text-xs text-slate-600">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#0056D2]" /> AI tutoring (65%)</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#bcd3f7]" /> Content gen (35%)</span>
                  </div>
                </div>

                <div>
                  <label htmlFor="enara-topup" className={labelCls}>Top-up amount (credits)</label>
                  <input
                    id="enara-topup"
                    type="number"
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(e.target.value)}
                    className={inputCls}
                    placeholder="Amount"
                  />
                </div>
                <p className="text-xs text-slate-600">Changes are applied instantly to the partner's API access.</p>
              </div>

              <div className="px-6 py-4 border-t border-slate-200 flex flex-wrap justify-end gap-2">
                <button className="inline-flex items-center gap-2 h-10 px-4 border border-rose-300 bg-white text-rose-700 hover:bg-rose-50 rounded-md text-sm font-semibold">
                  <Ban size={16} /> Stop / cancel
                </button>
                <button className="inline-flex items-center gap-2 h-10 px-4 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 rounded-md text-sm font-semibold">
                  <RotateCcw size={16} /> Renew plan
                </button>
                <button className="inline-flex items-center gap-2 h-10 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-sm font-bold">
                  <CreditCard size={16} /> Top up
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Register Administrator Modal (Enara Admin Privilege) */}
      <AnimatePresence>
        {isRegisterAdminModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSubmittingAdmin && closeRegisterAdminModal()}
              className="absolute inset-0 bg-slate-900/50"
            />
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-lg bg-white rounded-xl border border-slate-200 overflow-hidden"
            >
              {adminFormSuccess ? (
                <>
                  <div className="p-6 text-center space-y-3">
                    <CheckCircle2 size={36} className="mx-auto text-green-700" />
                    <h3 className="text-lg font-bold text-slate-900">Administrator registered</h3>
                    <p className="text-sm text-slate-600">
                      A login was created for {newAdmin.name} ({newAdmin.email}). This password is shown only once; copy it now and share it securely.
                    </p>
                    {createdAdminPassword && (
                      <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-md border border-slate-200 font-mono text-sm text-left">
                        <span className="text-slate-600">Password:</span>
                        <span className="text-slate-900 font-bold break-all">{createdAdminPassword}</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(`Email: ${newAdmin.email}\nPassword: ${createdAdminPassword}`);
                            toast.success('Copied', 'Login details copied to clipboard.');
                          }}
                          className="p-2 text-slate-600 hover:text-slate-900"
                          title="Copy login details"
                          aria-label="Copy login details"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
                    <button
                      type="button"
                      onClick={closeRegisterAdminModal}
                      className="h-10 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-sm font-bold"
                    >
                      Done
                    </button>
                  </div>
                </>
              ) : (
                <form onSubmit={handleRegisterAdminSubmit}>
                  <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Register administrator</h3>
                      <p className="text-sm text-slate-600 mt-0.5">
                        Create an administrator login. Only Enara admins can create admin accounts.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsRegisterAdminModalOpen(false)}
                      aria-label="Close"
                      className="p-2 text-slate-600 hover:bg-slate-100 rounded-md"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="p-6 space-y-4">
                    <div>
                      <label htmlFor="adm-name" className={labelCls}>Administrator name</label>
                      <input
                        id="adm-name"
                        required
                        type="text"
                        value={newAdmin.name}
                        onChange={(e) => setNewAdmin({...newAdmin, name: e.target.value})}
                        placeholder="e.g. Dr. Robert Vance"
                        className={inputCls}
                      />
                    </div>

                    <div>
                      <label htmlFor="adm-email" className={labelCls}>Email address</label>
                      <input
                        id="adm-email"
                        required
                        type="email"
                        value={newAdmin.email}
                        onChange={(e) => setNewAdmin({...newAdmin, email: e.target.value})}
                        placeholder="admin@institution.edu"
                        className={inputCls}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="adm-role" className={labelCls}>Admin role</label>
                        <select
                          id="adm-role"
                          value={newAdmin.role}
                          onChange={(e) => setNewAdmin({...newAdmin, role: e.target.value as any})}
                          className={inputCls}
                        >
                          <option value="admin">Institution Administrator</option>
                          <option value="institution-admin">Academic Director</option>
                          <option value="enara-admin">Enara Platform Admin</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="adm-inst" className={labelCls}>Institution ID</label>
                        <input
                          id="adm-inst"
                          type="text"
                          value={newAdmin.institution}
                          onChange={(e) => setNewAdmin({...newAdmin, institution: e.target.value})}
                          placeholder="e.g. ORG-001"
                          required={newAdmin.role !== 'enara-admin'}
                          className={inputCls}
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="adm-dept" className={labelCls}>Department</label>
                      <input
                        id="adm-dept"
                        type="text"
                        value={newAdmin.department}
                        onChange={(e) => setNewAdmin({...newAdmin, department: e.target.value})}
                        placeholder="e.g. Academic Affairs / Engineering"
                        className={inputCls}
                      />
                    </div>
                  </div>

                  <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsRegisterAdminModalOpen(false)}
                      className="h-10 px-4 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 rounded-md text-sm font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingAdmin}
                      className="inline-flex items-center gap-2 h-10 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-sm font-bold disabled:opacity-50"
                    >
                      {isSubmittingAdmin ? (
                        <><RefreshCw size={16} className="animate-spin" /> Saving...</>
                      ) : (
                        <><UserCheck size={16} /> Create administrator</>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
