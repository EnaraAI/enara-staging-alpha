
import React, { useState } from 'react';
import { 
  CreditCard, 
  Zap, 
  Shield, 
  BarChart3, 
  TrendingUp, 
  Users, 
  Database, 
  Cpu,
  ArrowUpRight,
  ArrowDownRight,
  Settings,
  Download,
  Calendar,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  PieChart as PieChartIcon,
  Plus
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip as RechartsTooltip 
} from 'recharts';
import { ResearchInsights } from './ResearchInsights';

export const ManagementDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'usage' | 'billing' | 'research'>('overview');
  const [isRechargeModalOpen, setIsRechargeModalOpen] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState(1000000);

  const stats = [
    { label: 'Total Revenue', value: '$42,500', change: '+12.5%', trend: 'up', icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Active Students', value: '1,284', change: '+5.2%', trend: 'up', icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'AI Tokens Used', value: '8.4M', change: '+18.1%', trend: 'up', icon: Cpu, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Storage Used', value: '142 GB', change: '-2.4%', trend: 'down', icon: Database, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  const usageLimits = [
    { name: 'AI Generation', used: 8400000, limit: 10000000, unit: 'Tokens', color: 'bg-purple-600' },
    { name: 'Student Seats', used: 1284, limit: 2000, unit: 'Users', color: 'bg-blue-600' },
    { name: 'Cloud Storage', used: 142, limit: 500, unit: 'GB', color: 'bg-amber-600' },
    { name: 'Assessment Runs', used: 450, limit: 1000, unit: 'Runs', color: 'bg-teal-600' },
  ];

  const transactions = [
    { id: 'TX-9021', date: 'Mar 10, 2026', amount: '$4,500.00', status: 'Paid', method: 'Visa •••• 4242' },
    { id: 'TX-9020', date: 'Feb 10, 2026', amount: '$4,500.00', status: 'Paid', method: 'Visa •••• 4242' },
    { id: 'TX-9019', date: 'Jan 10, 2026', amount: '$4,500.00', status: 'Paid', method: 'Visa •••• 4242' },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => window.history.back()} 
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
            title="Go Back"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Management Dashboard</h1>
            <p className="text-sm sm:text-base text-slate-500">Monitor usage, billing, and institutional performance.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-semibold hover:bg-slate-50 transition-all text-sm">
            <Calendar size={18} /> <span className="whitespace-nowrap">Last 30 Days</span>
          </button>
          <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all text-sm">
            <Download size={18} /> <span className="whitespace-nowrap">Export Report</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto no-scrollbar">
        <button 
          onClick={() => setActiveTab('overview')}
          className={`px-4 sm:px-6 py-4 font-bold text-sm transition-all relative whitespace-nowrap ${activeTab === 'overview' ? 'text-teal-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Overview
          {activeTab === 'overview' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('usage')}
          className={`px-4 sm:px-6 py-4 font-bold text-sm transition-all relative whitespace-nowrap ${activeTab === 'usage' ? 'text-teal-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Usage & Limits
          {activeTab === 'usage' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('billing')}
          className={`px-4 sm:px-6 py-4 font-bold text-sm transition-all relative whitespace-nowrap ${activeTab === 'billing' ? 'text-teal-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Billing & Payments
          {activeTab === 'billing' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('research')}
          className={`px-4 sm:px-6 py-4 font-bold text-sm transition-all relative whitespace-nowrap ${activeTab === 'research' ? 'text-teal-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Institutional Research
          {activeTab === 'research' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600" />}
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {stats.map((stat, i) => (
              <div key={i} className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-100 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div className={`p-2.5 sm:p-3 rounded-2xl ${stat.bg} ${stat.color}`}>
                    <stat.icon size={20} className="sm:w-6 sm:h-6" />
                  </div>
                  <div className={`flex items-center gap-1 text-[10px] sm:text-xs font-bold ${stat.trend === 'up' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {stat.trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {stat.change}
                  </div>
                </div>
                <p className="text-xs sm:text-sm font-medium text-slate-500 mb-1">{stat.label}</p>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900">{stat.value}</h3>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
            {/* Course Progress Overview */}
            <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm p-6 sm:p-8">
              <div className="flex justify-between items-center mb-6 sm:mb-8">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900">Course Progress Calculation</h3>
                  <p className="text-xs sm:text-sm text-slate-500">Global completion rates across all curricula.</p>
                </div>
                <TrendingUp className="text-teal-600 shrink-0" />
              </div>
              
              <div className="space-y-5 sm:space-y-6">
                {[
                  { name: 'Advanced Mathematics', progress: 78, students: 450 },
                  { name: 'Quantum Physics', progress: 62, students: 320 },
                  { name: 'English Literature', progress: 85, students: 514 },
                ].map((course, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-xs sm:text-sm">
                      <span className="font-bold text-slate-700">{course.name}</span>
                      <span className="text-slate-500">{course.progress}% Completion • {course.students} Students</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-teal-600 rounded-full transition-all duration-1000" 
                        style={{ width: `${course.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              
              <button className="w-full mt-6 sm:mt-8 py-3 bg-slate-50 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-all flex items-center justify-center gap-2 text-sm">
                View Detailed Analytics <ArrowUpRight size={18} />
              </button>
            </div>

            {/* Quick Actions / Status */}
            <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white flex flex-col justify-between">
              <div>
                <h3 className="text-lg sm:text-xl font-bold mb-2">System Status</h3>
                <p className="text-slate-400 text-xs sm:text-sm mb-6 sm:mb-8">All systems operational across 4 regions.</p>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/10">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">AI Engine</p>
                      <p className="text-xs sm:text-sm font-medium truncate">Gemini Pro 1.5 • Online</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/10">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Database</p>
                      <p className="text-xs sm:text-sm font-medium truncate">Firestore Cluster • Healthy</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-8">
                <p className="text-[10px] sm:text-xs text-slate-500 mb-4">Current Plan: <span className="text-white font-bold">Institutional Pro</span></p>
                <button className="w-full py-3 bg-teal-500 text-slate-900 font-bold rounded-xl hover:bg-teal-400 transition-all text-sm">
                  Manage Subscription
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'usage' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {usageLimits.map((limit, i) => (
            <div key={i} className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">{limit.name}</h3>
                <span className="text-xs sm:text-sm text-slate-500 font-medium">
                  {limit.used.toLocaleString()} / {limit.limit.toLocaleString()} {limit.unit}
                </span>
              </div>
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden mb-4">
                <div 
                  className={`h-full ${limit.color} rounded-full transition-all duration-1000`}
                  style={{ width: `${(limit.used / limit.limit) * 100}%` }}
                />
              </div>
              <div className="flex justify-between items-center">
                <p className="text-[10px] sm:text-xs text-slate-500">
                  {Math.round((limit.used / limit.limit) * 100)}% of monthly quota used
                </p>
                {limit.used / limit.limit > 0.8 && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 uppercase">
                    <AlertCircle size={12} /> Near Limit
                  </span>
                )}
              </div>
            </div>
          ))}
          
          <div className="sm:col-span-2 bg-amber-50 border border-amber-100 p-5 sm:p-6 rounded-3xl flex flex-col sm:flex-row items-start gap-4">
            <div className="p-3 bg-white rounded-2xl text-amber-600 shrink-0">
              <Zap size={24} />
            </div>
            <div>
              <h4 className="font-bold text-amber-900">Need more resources?</h4>
              <p className="text-xs sm:text-sm text-amber-700 mb-4">Your institution is growing fast. Consider upgrading to the Enterprise plan for unlimited AI generation and dedicated support.</p>
              <button className="w-full sm:w-auto px-6 py-2.5 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition-all text-sm">
                Contact Sales
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'billing' && (
        <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
            <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-6 sm:p-8 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-bold text-slate-900">Billing History</h3>
                <button className="text-teal-600 font-bold text-xs sm:text-sm hover:underline">Download All</button>
              </div>
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-6 sm:px-8 py-4 text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Invoice ID</th>
                      <th className="px-6 sm:px-8 py-4 text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Date</th>
                      <th className="px-6 sm:px-8 py-4 text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Amount</th>
                      <th className="px-6 sm:px-8 py-4 text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 sm:px-8 py-4 text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.map((tx, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-all">
                        <td className="px-6 sm:px-8 py-4 text-xs sm:text-sm font-bold text-slate-900">{tx.id}</td>
                        <td className="px-6 sm:px-8 py-4 text-xs sm:text-sm text-slate-500">{tx.date}</td>
                        <td className="px-6 sm:px-8 py-4 text-xs sm:text-sm font-bold text-slate-900">{tx.amount}</td>
                        <td className="px-6 sm:px-8 py-4">
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-lg uppercase">
                            {tx.status}
                          </span>
                        </td>
                        <td className="px-6 sm:px-8 py-4">
                          <button className="p-2 text-slate-400 hover:text-teal-600 transition-all">
                            <Download size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-sm">
                <h3 className="font-bold text-slate-900 mb-6">Payment Method</h3>
                <div className="p-4 border border-slate-200 rounded-2xl flex items-center gap-4 mb-6">
                  <div className="p-2 bg-slate-100 rounded-lg shrink-0">
                    <CreditCard size={24} className="text-slate-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">Visa ending in 4242</p>
                    <p className="text-xs text-slate-500">Expires 12/2028</p>
                  </div>
                  <CheckCircle2 size={20} className="text-teal-600 shrink-0" />
                </div>
                <button className="w-full py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all text-sm">
                  Update Method
                </button>
              </div>

              <div className="bg-teal-900 p-6 sm:p-8 rounded-3xl text-white">
                <Shield className="text-teal-400 mb-4" size={32} />
                <h3 className="font-bold text-lg mb-2">Secure Billing</h3>
                <p className="text-teal-100/60 text-xs sm:text-sm leading-relaxed">
                  Your payment information is encrypted and processed securely via Stripe. We never store your full card details.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'research' && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <ResearchInsights />
        </div>
      )}
    </div>
  );
};
