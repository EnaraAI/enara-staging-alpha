
import React, { useState } from 'react';
import { 
  Building2, 
  Users, 
  AlertTriangle, 
  Clock, 
  TrendingDown, 
  Search, 
  Filter,
  ArrowRight,
  LifeBuoy,
  Plus,
  Info,
  Mail,
  Phone,
  User,
  X,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';

const INSTITUTIONS = [
  { 
    id: '1', 
    name: 'Global Tech Academy', 
    students: 42500, 
    active: 38200, 
    status: 'Healthy', 
    credits: 842000, 
    limit: 1000000, 
    lastActive: '2m ago', 
    tickets: 5, 
    resolution: '2.4h', 
    onboarding: '14d',
    director: 'Dr. Sarah Ahmed',
    email: 's.ahmed@globaltech.edu',
    phone: '+20 100 123 4567',
    lms: 'Canvas'
  },
  { 
    id: '2', 
    name: 'Future Skills Inst.', 
    students: 28400, 
    active: 24100, 
    status: 'Warning', 
    credits: 124000, 
    limit: 150000, 
    lastActive: '15m ago', 
    tickets: 12, 
    resolution: '4.8h', 
    onboarding: '22d',
    director: 'Eng. Omar Hassan',
    email: 'o.hassan@futureskills.org',
    phone: '+20 111 987 6543',
    lms: 'Moodle'
  },
  { 
    id: '3', 
    name: 'Elite Learning Corp', 
    students: 18200, 
    active: 16800, 
    status: 'Healthy', 
    credits: 450000, 
    limit: 500000, 
    lastActive: '5m ago', 
    tickets: 2, 
    resolution: '1.2h', 
    onboarding: '10d',
    director: 'Prof. Nadia Zaki',
    email: 'n.zaki@elitelearning.com',
    phone: '+20 122 333 4444',
    lms: 'Blackboard'
  },
  { 
    id: '4', 
    name: 'Standard University', 
    students: 32100, 
    active: 22400, 
    status: 'At Risk', 
    credits: 12000, 
    limit: 100000, 
    lastActive: '1h ago', 
    tickets: 28, 
    resolution: '12.5h', 
    onboarding: '35d',
    director: 'Dr. Khaled Mansour',
    email: 'k.mansour@standard.edu.eg',
    phone: '+20 155 777 8888',
    lms: 'Canvas'
  },
  { 
    id: '5', 
    name: 'Cairo Central School', 
    students: 5000, 
    active: 0, 
    status: 'Churn Risk', 
    credits: 50000, 
    limit: 50000, 
    lastActive: '32d ago', 
    tickets: 0, 
    resolution: '0h', 
    onboarding: '45d',
    director: 'Mrs. Laila Fouad',
    email: 'l.fouad@cairocentral.sch.eg',
    phone: '+20 100 000 1111',
    lms: 'Google Classroom'
  },
];

interface InstitutionCRMProps {
  onNavigate?: (tab: string) => void;
}

export const InstitutionCRM: React.FC<InstitutionCRMProps> = ({ onNavigate }) => {
  const [selectedInst, setSelectedInst] = useState<typeof INSTITUTIONS[0] | null>(null);
  const upsellList = INSTITUTIONS.filter(i => (i.credits / i.limit) > 0.8);
  const churnRiskList = INSTITUTIONS.filter(i => i.active === 0 || i.status === 'Churn Risk');

  const th = 'px-5 py-3 font-semibold';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-teal-700">Enara business</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold text-slate-900">Institutions</h1>
            <p className="mt-2 inline-block text-xs font-bold uppercase tracking-wide bg-amber-100 text-amber-900 rounded px-2 py-1">Sample data: example figures, not connected to live records yet</p>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">Sample data</span>
          </div>
          <p className="mt-1 text-slate-600">Managing {INSTITUTIONS.length} active partner institutions.</p>
        </div>
        <button
          onClick={() => onNavigate?.('integrations')}
          className="inline-flex items-center gap-2 h-10 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-sm font-bold whitespace-nowrap"
        >
          <Plus size={16} aria-hidden="true" /> Add partner
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-white border border-slate-200 rounded-xl min-w-0">
          <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">Institution directory</h2>
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} aria-hidden="true" />
              <input type="text" aria-label="Search institutions" placeholder="Search institutions..." className="pl-9 pr-3 h-10 bg-white border border-slate-300 rounded-md text-sm outline-none w-full focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-t border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th className={th}>Institution</th>
                  <th className={th}>Students (A/E)</th>
                  <th className={th}>Onboarding</th>
                  <th className={th}>Support</th>
                  <th className={th}>Status</th>
                  <th className={`${th} text-right`}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {INSTITUTIONS.map((inst) => (
                  <tr key={inst.id} className="border-t border-slate-100">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 shrink-0 rounded-md bg-blue-50 flex items-center justify-center text-teal-700 font-bold">
                          {inst.name[0]}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{inst.name}</p>
                          <p className="text-xs text-slate-600">Last active {inst.lastActive}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-900">{Math.round((inst.active/inst.students)*100)}%</p>
                      <p className="text-xs text-slate-600">{inst.active.toLocaleString()} / {inst.students.toLocaleString()}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-700">{inst.onboarding}</td>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-900">{inst.tickets} tickets</p>
                      <p className="text-xs text-slate-600">avg {inst.resolution}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${
                        inst.status === 'Healthy' ? 'bg-green-50 text-green-800' :
                        inst.status === 'Warning' ? 'bg-orange-50 text-orange-800' :
                        'bg-red-50 text-red-800'
                      }`}>
                        {inst.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => setSelectedInst(inst)}
                        className="p-2 text-slate-600 hover:text-teal-700 hover:bg-slate-100 rounded-md"
                        title="View Partner Info"
                        aria-label={`View partner info for ${inst.name}`}
                      >
                        <Info size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5 self-start">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <TrendingDown size={18} className="text-red-700" aria-hidden="true" /> Churn risk
          </h2>
          <div className="mt-4 space-y-3">
            {churnRiskList.map(inst => (
              <div key={inst.id} className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                <p className="font-semibold text-slate-900">{inst.name}</p>
                <p className="text-sm text-orange-800 mt-0.5">0 activity in last 30 days</p>
                <button className="mt-3 w-full h-9 bg-white text-slate-700 text-sm font-semibold rounded-md border border-slate-300 hover:bg-slate-50">
                  Reach out
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
      {selectedInst && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50">
          <div role="dialog" aria-modal="true" aria-labelledby="inst-modal-title" className="bg-white rounded-xl w-full max-w-lg shadow-xl overflow-hidden">
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 shrink-0 rounded-md bg-blue-50 flex items-center justify-center text-teal-700 text-lg font-bold">
                  {selectedInst.name[0]}
                </div>
                <div>
                  <h2 id="inst-modal-title" className="text-xl font-bold text-slate-900">{selectedInst.name}</h2>
                  <p className="text-sm text-slate-600">
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-800">{selectedInst.lms} integration</span>
                    <span className="ml-2">ID: {selectedInst.id.padStart(4, '0')}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedInst(null)}
                aria-label="Close"
                className="p-2 text-slate-600 hover:bg-slate-100 rounded-md"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Primary contact (director)</h3>
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg text-sm">
                <li className="flex items-center gap-3 px-4 py-3">
                  <User size={16} className="text-slate-500" aria-hidden="true" />
                  <span className="font-semibold text-slate-900">{selectedInst.director}</span>
                </li>
                <li className="flex items-center gap-3 px-4 py-3">
                  <Mail size={16} className="text-slate-500" aria-hidden="true" />
                  <span className="text-slate-700 break-all">{selectedInst.email}</span>
                </li>
                <li className="flex items-center gap-3 px-4 py-3">
                  <Phone size={16} className="text-slate-500" aria-hidden="true" />
                  <span className="text-slate-700">{selectedInst.phone}</span>
                </li>
              </ul>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex flex-wrap justify-end gap-2">
              <button className="inline-flex items-center gap-2 h-10 px-4 border border-slate-300 bg-white text-slate-700 rounded-md text-sm font-semibold hover:bg-slate-50">
                <ShieldCheck size={16} aria-hidden="true" />
                Manage platform keys
              </button>
              <button
                onClick={() => window.location.href = `mailto:support@enara.ai?subject=Support Ticket: ${selectedInst.name}&body=Institution ID: ${selectedInst.id.padStart(4, '0')}\nDirector: ${selectedInst.director}\n\nProblem Description:`}
                className="inline-flex items-center gap-2 h-10 px-4 border border-slate-300 bg-white text-slate-700 rounded-md text-sm font-semibold hover:bg-slate-50"
              >
                <LifeBuoy size={16} aria-hidden="true" />
                Open ticket
              </button>
              <button
                onClick={() => window.location.href = `mailto:${selectedInst.email}?subject=Regarding ${selectedInst.name}&body=Dear ${selectedInst.director},`}
                className="inline-flex items-center gap-2 h-10 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-sm font-bold"
              >
                <Mail size={16} aria-hidden="true" />
                Send email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
