import React, { useState, useEffect } from 'react';
import { TutorFacePicker } from './TutorFacePicker';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Radio, 
  Settings, 
  Key, 
  Plus, 
  Edit3, 
  Check, 
  X, 
  Trash2, 
  Activity, 
  Zap, 
  Users, 
  Clock, 
  ShieldCheck, 
  Video, 
  Bot, 
  RefreshCw, 
  ExternalLink,
  Sparkles,
  Sliders,
  Server,
  AlertCircle,
  TrendingUp,
  BarChart2,
  MessageSquare,
  Calendar,
  Flame,
  Award
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { LiveAvatar, AvatarConfig, AvatarStreamAnalytics } from '../../types';

// Mock Student Interaction Frequency Datasets
const INTERACTION_FREQUENCY_DAILY = [
  { day: 'Mon', sessions: 142, prompts: 850, avgMinutes: 14.5, voicePct: 65 },
  { day: 'Tue', sessions: 189, prompts: 1120, avgMinutes: 16.2, voicePct: 70 },
  { day: 'Wed', sessions: 215, prompts: 1340, avgMinutes: 18.0, voicePct: 72 },
  { day: 'Thu', sessions: 260, prompts: 1620, avgMinutes: 17.8, voicePct: 68 },
  { day: 'Fri', sessions: 310, prompts: 1980, avgMinutes: 21.4, voicePct: 75 },
  { day: 'Sat', sessions: 285, prompts: 1750, avgMinutes: 22.0, voicePct: 80 },
  { day: 'Sun', sessions: 340, prompts: 2150, avgMinutes: 24.5, voicePct: 82 },
];

const INTERACTION_HOURLY_PEAKS = [
  { hour: '08:00', interactions: 45, label: 'Morning Prep' },
  { hour: '10:00', interactions: 110, label: 'Class Hours' },
  { hour: '12:00', interactions: 85, label: 'Lunch Break' },
  { hour: '14:00', interactions: 195, label: 'Afternoon Study' },
  { hour: '16:00', interactions: 320, label: 'Peak Tutoring' },
  { hour: '18:00', interactions: 410, label: 'Homework Hour' },
  { hour: '20:00', interactions: 380, label: 'Evening Review' },
  { hour: '22:00', interactions: 160, label: 'Late Night Q&A' },
];

const SUBJECT_INTERACTION_DISTRIBUTION = [
  { name: 'Mathematics', value: 42, color: '#0056D2' },
  { name: 'Physical Sciences', value: 28, color: '#0b3d91' },
  { name: 'Humanities & Lit', value: 18, color: '#d97706' },
  { name: 'Computer Science', value: 12, color: '#15803d' },
];
import { 
  fetchAvatarsList, 
  fetchAvatarConfig, 
  saveAvatarConfig, 
  saveAdminAvatar, 
  toggleAvatarActiveStatus,
  fetchAvatarAnalytics
} from '../../services/avatarService';
import { LiveAvatarModal } from './LiveAvatarModal';

export const AdminAvatarControlCenter: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'config' | 'avatars' | 'analytics' | 'tester'>('avatars');
  const [avatars, setAvatars] = useState<LiveAvatar[]>([]);
  const [config, setConfig] = useState<AvatarConfig>({
    provider: 'enara-webrtc',
    apiKey: '',
    apiEndpoint: '/api/avatar',
    defaultAvatarId: 'av-001',
    quality: '1080p',
    autoStartVideo: true,
    enableSubtitles: true,
    sessionTimeoutMinutes: 30,
    maxConcurrentSessions: 500,
    webrtcIceServers: ['stun:stun.l.google.com:19302']
  });
  const [analytics, setAnalytics] = useState<AvatarStreamAnalytics | null>(null);

  // Analytics chart state
  const [interactionViewMode, setInteractionViewMode] = useState<'daily' | 'hourly'>('daily');

  // Form states
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configSaveMessage, setConfigSaveMessage] = useState<string | null>(null);

  // Edit / Add Avatar Modal
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState<Partial<LiveAvatar> | null>(null);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);

  // Live Stream Tester Modal
  const [isTesterOpen, setIsTesterOpen] = useState(false);
  const [testAvatarId, setTestAvatarId] = useState<string>('av-001');

  // Load initial data
  const loadData = async () => {
    const list = await fetchAvatarsList();
    setAvatars(list);

    const cfg = await fetchAvatarConfig();
    setConfig(cfg);

    const ana = await fetchAvatarAnalytics();
    setAnalytics(ana);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Save config
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    setConfigSaveMessage(null);

    try {
      const res = await saveAvatarConfig({
        ...config,
        apiKey: '',
      });

      if (res.success && res.config) {
        setConfig(res.config);
        setConfigSaveMessage(res.message || "Configuration updated successfully");
      }
    } catch (err) {
      console.error(err);
      setConfigSaveMessage("Failed to update server configuration");
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Toggle active status
  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    const success = await toggleAvatarActiveStatus(id, !currentStatus);
    if (success) {
      setAvatars(prev => prev.map(a => a.id === id ? { ...a, isActive: !currentStatus } : a));
    }
  };

  // Open edit modal
  const handleOpenEditAvatar = (avatar?: LiveAvatar) => {
    if (avatar) {
      setEditingAvatar({ ...avatar });
    } else {
      setEditingAvatar({
        name: '',
        title: 'Academic Tutor',
        subject: 'General Education',
        provider: 'enara-webrtc',
        avatarModelId: 'Athena_Expressive_v2',
        voiceId: 'en-US-JennyNeural',
        avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=600',
        accent: 'Clear Academic',
        personalityPrompt: 'Encouraging, step-by-step guidance.',
        isActive: true,
        tags: ['Custom', 'Academic'],
        streamingQuality: '1080p',
        gender: 'female'
      });
    }
    setIsAvatarModalOpen(true);
  };

  // Save Avatar
  const handleSaveAvatarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAvatar) return;

    setIsSavingAvatar(true);
    try {
      const res = await saveAdminAvatar(editingAvatar);
      if (res.success) {
        await loadData();
        setIsAvatarModalOpen(false);
        setEditingAvatar(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingAvatar(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-wide text-teal-700">AI avatar</p>
          <h1 className="text-3xl font-extrabold text-slate-900">Live avatar control</h1>
          <p className="text-slate-600 mt-1">
            Manage avatar settings and review stream sessions.
          </p>
          <p className="mt-2 inline-block text-xs font-bold uppercase tracking-wide bg-amber-100 text-amber-900 rounded px-2 py-1">
            Sample data: settings here are saved in this browser only. Tutor faces are set under Tutor faces.
          </p>
        </div>
        <button
          onClick={() => setIsTesterOpen(true)}
          className="h-11 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-bold text-sm inline-flex items-center gap-2"
        >
          <Video size={16} />
          Test Live Stream
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Active streams</span>
            <Activity size={16} className="text-slate-600" />
          </div>
          <p className="text-3xl font-extrabold text-slate-900 mt-1">{analytics?.activeSessionsCount ?? '—'}</p>
          <p className="text-xs text-slate-600 mt-1">WebRTC sessions</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Avg latency</span>
            <Zap size={16} className="text-slate-600" />
          </div>
          <p className="text-3xl font-extrabold text-slate-900 mt-1">{analytics?.avgLatencyMs ?? '—'}{analytics?.avgLatencyMs != null && <span className="text-sm font-normal text-slate-600"> ms</span>}</p>
          <p className="text-xs text-slate-600 mt-1">Average across streams</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Configured avatars</span>
            <Bot size={16} className="text-slate-600" />
          </div>
          <p className="text-3xl font-extrabold text-slate-900 mt-1">{avatars.length}</p>
          <p className="text-xs text-slate-600 mt-1">{avatars.filter(a => a.isActive).length} active for students</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Provider</span>
            <Server size={16} className="text-slate-600" />
          </div>
          <p className="text-3xl font-extrabold text-slate-900 mt-1"><span className="text-xl">{config.provider}</span></p>
          <p className="text-xs text-slate-600 mt-1">{config.quality} default quality</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-6 border-b border-slate-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('avatars')}
          aria-pressed={activeTab === 'avatars'}
          className={`-mb-px px-1 py-3 border-b-2 font-semibold text-sm whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'avatars'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Bot size={16} />
          Tutor faces
        </button>

        <button
          onClick={() => setActiveTab('config')}
          aria-pressed={activeTab === 'config'}
          className={`-mb-px px-1 py-3 border-b-2 font-semibold text-sm whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'config'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Key size={16} />
          API & Provider Config
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          aria-pressed={activeTab === 'analytics'}
          className={`-mb-px px-1 py-3 border-b-2 font-semibold text-sm whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'analytics'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Activity size={16} />
          Telemetry & Sessions
        </button>
      </div>

      {/* TAB 1: the live tutor's face for the school and each course */}
      {activeTab === 'avatars' && <TutorFacePicker />}

      {/* TAB 2: API & PROVIDER CONFIG */}
      {activeTab === 'config' && (
        <div className="max-w-4xl bg-white rounded-xl p-6 border border-slate-200 space-y-8">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Server-Side Avatar Service API & WebRTC Setup</h3>
            <p className="text-xs text-slate-600 mt-1">Default streaming parameters.</p>
          </div>

          {configSaveMessage && (
            <div className="p-4 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-sm font-bold flex items-center gap-2">
              <Check size={16} className="text-teal-600" />
              {configSaveMessage}
            </div>
          )}

          <form onSubmit={handleSaveConfig} className="space-y-6">
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-900">1. Enara Avatar Credentials</h4>
              
              <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-md p-3">
                Provider API keys (Anam, ElevenLabs) are set as server environment variables and are never entered or stored in the browser.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700">API Endpoint URL</label>
                  <input
                    type="text"
                    value={config.apiEndpoint}
                    onChange={(e) => setConfig({ ...config, apiEndpoint: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-md px-3 h-11 text-sm font-mono focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700">Default Video Quality</label>
                  <select
                    value={config.quality}
                    onChange={(e) => setConfig({ ...config, quality: e.target.value as any })}
                    className="w-full bg-white border border-slate-300 rounded-md px-3 h-11 text-sm focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 focus:outline-none"
                  >
                    <option value="720p">720p HD (Low Latency / Bandwidth Optimized)</option>
                    <option value="1080p">1080p Full HD (Crisp Academic Video)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h4 className="text-sm font-bold text-slate-900">2. WebRTC & Stream Limits</h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700">Session Timeout (Minutes)</label>
                  <input
                    type="number"
                    value={config.sessionTimeoutMinutes}
                    onChange={(e) => setConfig({ ...config, sessionTimeoutMinutes: parseInt(e.target.value) || 30 })}
                    className="w-full bg-white border border-slate-300 rounded-md px-3 h-11 text-sm focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700">Max Concurrent Streams</label>
                  <input
                    type="number"
                    value={config.maxConcurrentSessions}
                    onChange={(e) => setConfig({ ...config, maxConcurrentSessions: parseInt(e.target.value) || 500 })}
                    className="w-full bg-white border border-slate-300 rounded-md px-3 h-11 text-sm focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={isSavingConfig}
                className="h-11 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-bold text-sm disabled:opacity-50"
              >
                {isSavingConfig ? 'Saving Configurations...' : 'Save & Deploy Settings'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: ANALYTICS & RECENT SESSIONS */}
      {activeTab === 'analytics' && analytics && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="rounded-full px-2.5 py-1 text-xs font-bold bg-orange-50 text-orange-800 border border-orange-200">Sample data</span>
            The interaction cards and charts below are illustrative; the connections table shows sessions returned by the avatar service.
          </div>
          {/* Interaction Metrics High-Level Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-5 border border-slate-200 flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700 shrink-0">
                <BarChart2 size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-600">Weekly Interactions</p>
                <h4 className="text-2xl font-extrabold text-slate-900 mt-0.5">1,741</h4>
                <p className="text-xs font-bold text-green-700 flex items-center gap-1 mt-1">
                  <TrendingUp size={12} /> +18.4% vs last week
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200 flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700 shrink-0">
                <MessageSquare size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-600">Total Voice Prompts</p>
                <h4 className="text-2xl font-extrabold text-slate-900 mt-0.5">10,810</h4>
                <p className="text-xs text-slate-600 mt-1">
                  Avg 6.2 prompts/session
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200 flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700 shrink-0">
                <Clock size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-600">Avg Session Duration</p>
                <h4 className="text-2xl font-extrabold text-slate-900 mt-0.5">19.2 min</h4>
                <p className="text-xs text-green-700 font-bold mt-1">
                  High engagement retention
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200 flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700 shrink-0">
                <Flame size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-600">Peak Hour Window</p>
                <h4 className="text-2xl font-extrabold text-slate-900 mt-0.5">6:00 - 8:00 PM</h4>
                <p className="text-xs text-slate-600 font-bold mt-1">
                  Post-school homework peak
                </p>
              </div>
            </div>
          </div>

          {/* Primary Chart: Student Interaction Frequency */}
          <div className="bg-white rounded-xl p-6 border border-slate-200 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900">Student Interaction Frequency with Live AI Avatar Tutor</h3>
                  <span className="rounded-full px-2.5 py-1 bg-orange-50 text-orange-800 text-xs font-bold border border-orange-200">
                    Sample data
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Tracks total daily student WebRTC sessions, voice speech prompts, and active tutoring duration.
                </p>
              </div>

              {/* Chart Controls */}
              <div className="flex items-center gap-4 self-start sm:self-auto border-b border-slate-200">
                <button
                  onClick={() => setInteractionViewMode('daily')}
                  className={`-mb-px px-1 py-2 border-b-2 text-sm font-semibold flex items-center gap-1.5 ${
                    interactionViewMode === 'daily'
                      ? 'border-teal-600 text-teal-700'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Calendar size={14} />
                  <span>Daily Frequency</span>
                </button>
                <button
                  onClick={() => setInteractionViewMode('hourly')}
                  className={`-mb-px px-1 py-2 border-b-2 text-sm font-semibold flex items-center gap-1.5 ${
                    interactionViewMode === 'hourly'
                      ? 'border-teal-600 text-teal-700'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Clock size={14} />
                  <span>Peak Hours</span>
                </button>
              </div>
            </div>

            {/* Recharts Container */}
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                {interactionViewMode === 'daily' ? (
                  <AreaChart data={INTERACTION_FREQUENCY_DAILY} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f6" />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                      labelStyle={{ color: '#334155', fontWeight: 'bold', marginBottom: '4px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                    <Area 
                      type="monotone" 
                      dataKey="sessions" 
                      name="Student Sessions" 
                      stroke="#0056D2" 
                      strokeWidth={2} 
                      fill="#bcd3f7"
                      fillOpacity={0.25} 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="prompts" 
                      name="User Prompts / Turns" 
                      stroke="#0b3d91" 
                      strokeWidth={2} 
                      fill="none" 
                    />
                  </AreaChart>
                ) : (
                  <BarChart data={INTERACTION_HOURLY_PEAKS} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f6" />
                    <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                      formatter={(value: any) => [`${value} Sessions`, 'Interactions']}
                    />
                    <Bar dataKey="interactions" name="Active Student Sessions" radius={[4, 4, 0, 0]}>
                      {INTERACTION_HOURLY_PEAKS.map((entry, index) => (
                        <Cell 
                          key={`bar-cell-${index}-${entry.hour}`} 
                          fill={entry.interactions > 300 ? '#0056D2' : '#bcd3f7'} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Secondary Charts & Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Subject Distribution */}
            <div className="bg-white rounded-xl p-6 border border-slate-200 space-y-4 lg:col-span-1">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Interaction by Subject Area</h4>
                <p className="text-xs text-slate-600">Distribution of live avatar tutoring requests across disciplines.</p>
              </div>

              <div className="h-48 w-full relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={SUBJECT_INTERACTION_DISTRIBUTION}
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {SUBJECT_INTERACTION_DISTRIBUTION.map((entry, index) => (
                        <Cell key={`pie-cell-${index}-${entry.name}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                      formatter={(val: any) => [`${val}%`, 'Share']}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xs font-bold text-slate-600">Top Subject</span>
                  <span className="text-sm font-bold text-teal-700">Math 42%</span>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                {SUBJECT_INTERACTION_DISTRIBUTION.map((item, idx) => (
                  <div key={`subject-dist-${item.name}-${idx}`} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="font-semibold text-slate-700">{item.name}</span>
                    </div>
                    <span className="font-mono font-bold text-slate-900">{item.value}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Live Avatar Sessions Table */}
            <div className="bg-white rounded-xl p-6 border border-slate-200 space-y-4 lg:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Active Live Avatar Connections</h4>
                  <p className="text-xs text-slate-600">Real-time WebRTC streams and latency diagnostics.</p>
                </div>
                <span className="rounded-full px-2.5 py-1 bg-green-50 text-green-800 text-xs font-bold flex items-center gap-1.5">
                  
                  {analytics.activeSessionsCount} active
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-slate-600 text-xs uppercase tracking-wide">
                      <th className="py-2.5 px-3">Session</th>
                      <th className="py-2.5 px-3">Student Name</th>
                      <th className="py-2.5 px-3">Avatar</th>
                      <th className="py-2.5 px-3">Provider</th>
                      <th className="py-2.5 px-3">Latency</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="[&>tr]:border-t [&>tr]:border-slate-100">
                    {analytics.recentSessions.map((sess, sessIdx) => (
                      <tr key={`recent-sess-${sess.id}-${sessIdx}`} className="hover:bg-slate-50/50">
                        <td className="py-3 px-3 font-mono font-bold text-slate-700">{sess.id}</td>
                        <td className="py-3 px-3 font-bold text-slate-900">{sess.studentName}</td>
                        <td className="py-3 px-3 text-slate-900 font-semibold">{sess.avatarName}</td>
                        <td className="py-3 px-3">
                          <span className="rounded-full px-2.5 py-1 bg-slate-100 text-xs font-bold text-slate-700">
                            {sess.provider}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-700 font-semibold">{sess.latencyMs}ms</td>
                        <td className="py-3 px-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${
                            sess.status === 'active' ? 'bg-green-50 text-green-800' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {sess.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT / CREATE AVATAR MODAL */}
      <AnimatePresence>
        {isAvatarModalOpen && editingAvatar && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAvatarModalOpen(false)}
              className="absolute inset-0 bg-slate-900/50"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-2xl bg-white rounded-xl p-6 shadow-xl z-10 border border-slate-200 overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
                <div>
                  <h3 className="font-bold text-xl text-slate-900">
                    {editingAvatar.id ? 'Edit Avatar Profile' : 'Add New Avatar Persona'}
                  </h3>
                  <p className="text-xs text-slate-600">Configure Avatar Model IDs and pedagogical attributes</p>
                </div>
                <button
                  onClick={() => setIsAvatarModalOpen(false)}
                  aria-label="Close"
                  className="p-2 rounded-md text-slate-600 hover:bg-slate-100"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSaveAvatarSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Avatar Name</label>
                    <input
                      type="text"
                      required
                      value={editingAvatar.name || ''}
                      onChange={(e) => setEditingAvatar({ ...editingAvatar, name: e.target.value })}
                      placeholder="e.g. Professor Alex"
                      className="w-full bg-white border border-slate-300 rounded-md p-3 text-sm focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Academic Title</label>
                    <input
                      type="text"
                      required
                      value={editingAvatar.title || ''}
                      onChange={(e) => setEditingAvatar({ ...editingAvatar, title: e.target.value })}
                      placeholder="e.g. Socratic Logic Specialist"
                      className="w-full bg-white border border-slate-300 rounded-md p-3 text-sm focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Avatar Model ID</label>
                    <input
                      type="text"
                      required
                      value={editingAvatar.avatarModelId || ''}
                      onChange={(e) => setEditingAvatar({ ...editingAvatar, avatarModelId: e.target.value })}
                      placeholder="e.g. Athena_Expressive_v2"
                      className="w-full bg-white border border-slate-300 rounded-md p-3 text-sm font-mono focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Voice Synthesis ID</label>
                    <input
                      type="text"
                      required
                      value={editingAvatar.voiceId || ''}
                      onChange={(e) => setEditingAvatar({ ...editingAvatar, voiceId: e.target.value })}
                      placeholder="e.g. en-US-JennyNeural"
                      className="w-full bg-white border border-slate-300 rounded-md p-3 text-sm font-mono focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Avatar Image / Poster URL</label>
                  <input
                    type="url"
                    required
                    value={editingAvatar.avatarUrl || ''}
                    onChange={(e) => setEditingAvatar({ ...editingAvatar, avatarUrl: e.target.value })}
                    placeholder="https://..."
                    className="w-full bg-white border border-slate-300 rounded-md p-3 text-sm focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">System Personality Prompt</label>
                  <textarea
                    rows={3}
                    value={editingAvatar.personalityPrompt || ''}
                    onChange={(e) => setEditingAvatar({ ...editingAvatar, personalityPrompt: e.target.value })}
                    placeholder="Define how this avatar interacts with students..."
                    className="w-full bg-white border border-slate-300 rounded-md p-3 text-sm focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 focus:outline-none resize-none"
                  />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAvatarModalOpen(false)}
                    className="h-10 px-4 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingAvatar}
                    className="h-10 px-4 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold disabled:opacity-50"
                  >
                    {isSavingAvatar ? 'Saving Avatar...' : 'Save Avatar'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* LIVE STREAM TESTER MODAL */}
      {isTesterOpen && (
        <LiveAvatarModal
          isOpen={isTesterOpen}
          onClose={() => setIsTesterOpen(false)}
          lessonTitle="Admin Interactive Stream Test Session"
          subject="Admin Diagnostic"
          initialAvatarId={testAvatarId}
        />
      )}
    </div>
  );
};
