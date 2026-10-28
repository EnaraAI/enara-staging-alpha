
import React, { useState } from 'react';
import { 
  GraduationCap, 
  Building2, 
  Cpu, 
  BookOpen,
  ArrowRight, 
  Eye, 
  EyeOff, 
  Lock, 
  Mail, 
  Sparkles,
  ChevronRight,
  ShieldCheck,
  Globe,
  Zap,
  AlertTriangle,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { login, logout, SessionUser } from '../services/apiService';
import { uiRoleFor, UiRole } from '../services/roleRouting';

interface LoginProps {
  onLogin: (role: UiRole, user: SessionUser) => void;
  isSharedCourse?: boolean;
  isSharedAssessment?: boolean;
}

export const Login: React.FC<LoginProps> = ({ onLogin, isSharedCourse, isSharedAssessment }) => {
  const [selectedRole, setSelectedRole] = useState<'student' | 'admin' | 'enara-admin' | null>(() => {
    if (isSharedCourse || isSharedAssessment) return 'student';
    return null;
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const handleSelectRole = (role: 'student' | 'admin' | 'enara-admin') => {
    setSelectedRole(role);
    setAuthError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;
    setAuthError(null);
    setIsLoading(true);

    try {
      const user = await login(email, password);
      // The account's role on the backend decides what the user can open
      // (services/roleRouting.ts). Academic managers get a read-only portal.
      const portal = uiRoleFor(user.role, selectedRole);
      if (!portal) {
        logout();
        const roleNames: Record<string, string> = {
          student: 'Student', teacher: 'Teacher', academic_manager: 'Academic Manager', admin: 'Administrator', 'enara-admin': 'Enara Administrator',
        };
        setAuthError(`This account can't sign in as ${roleNames[selectedRole]}. Choose "${roleNames[user.role] || user.role}" instead.`);
        return;
      }
      onLogin(portal, user);
    } catch (err: any) {
      setAuthError(err.status === 401 ? "Incorrect email or password." : (err.message || "Could not reach the server. Please try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const roles = [
    {
      id: 'student' as const,
      title: 'Student',
      description: 'Continue your learning journey, track progress, and access personalized support.',
      icon: GraduationCap,
      color: 'bg-blue-50 text-blue-600',
      accent: 'teal'
    },
    {
      id: 'admin' as const,
      title: 'Administrator',
      description: 'Manage students, programs, performance, and daily operations.',
      icon: Building2,
      color: 'bg-indigo-50 text-indigo-600',
      accent: 'teal'
    },
    {
      id: 'enara-admin' as const,
      title: 'Enara Administrator',
      description: 'Access platform oversight, system controls, and network-wide intelligence.',
      icon: Cpu,
      color: 'bg-indigo-50 text-indigo-600',
      accent: 'indigo'
    }
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-teal-200/20 blur-[120px] rounded-full"></div>
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-blue-200/20 blur-[120px] rounded-full"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#0056D2 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
      </div>

      <div className="w-full max-w-5xl z-10 py-8 sm:py-12">
        {/* Header Section */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-8 sm:mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-slate-200 shadow-sm mb-4 sm:mb-6">
            <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-teal-600 flex items-center justify-center">
              <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />
            </div>
            <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-500">Intelligence You Can Learn From</span>
          </div>
          
          <div className="flex items-center justify-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:xl bg-teal-600 flex items-center justify-center shadow-lg shadow-teal-600/20">
              <span className="text-white font-bold text-lg sm:text-xl">E</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">Enara</h1>
          </div>
          
          <p className="text-slate-500 max-w-md mx-auto text-base sm:text-lg px-4">
            Welcome to the intelligence layer. Please select your operational role to continue.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Role Selection Grid */}
          <div className={`lg:col-span-7 space-y-3 sm:space-y-4 transition-all duration-500 ${selectedRole ? 'lg:opacity-40 lg:blur-[2px] pointer-events-none lg:scale-95' : ''}`}>
            {roles.map((role, idx) => (
              <motion.button
                key={role.id}
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: idx * 0.1, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => handleSelectRole(role.id)}
                className={`w-full group relative flex items-center gap-4 sm:gap-6 p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-white border border-slate-200 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 hover:border-teal-200 transition-all duration-300 text-left ${selectedRole === role.id ? 'ring-2 ring-teal-500 border-transparent' : ''}`}
              >
                <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl ${role.color} flex items-center justify-center shrink-0 transition-transform duration-500 group-hover:scale-110`}>
                  <role.icon className="w-6 h-6 sm:w-8 sm:h-8" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-0.5 sm:mb-1 flex items-center gap-2">
                    {role.title}
                    <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-300 group-hover:text-teal-500 transition-colors" />
                  </h3>
                  <p className="text-slate-500 text-xs sm:text-sm leading-relaxed max-w-sm">
                    {role.description}
                  </p>
                </div>
                <div className="hidden sm:flex w-10 h-10 rounded-full bg-slate-50 items-center justify-center text-slate-300 group-hover:bg-teal-50 group-hover:text-teal-600 transition-all">
                  <ArrowRight size={20} />
                </div>
              </motion.button>
            ))}
          </div>

          {/* Login Form Area */}
          <div className="lg:col-span-5 relative">
            <AnimatePresence mode="wait">
              {!selectedRole ? (
                <motion.div
                  key="placeholder"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="hidden lg:flex flex-col items-center justify-center p-12 rounded-[2.5rem] border-2 border-dashed border-slate-200 bg-slate-50/50 h-full min-h-[400px] text-center"
                >
                  <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-300 mb-4">
                    <ShieldCheck size={32} />
                  </div>
                  <h4 className="text-slate-400 font-medium">Secure Access Portal</h4>
                  <p className="text-slate-400 text-sm mt-2">Select a role on the left to initialize the authentication sequence.</p>
                </motion.div>
              ) : (
                <motion.div
                  key="form"
                  initial={{ opacity: 0, x: 30, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 30, scale: 0.95 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="bg-white p-8 sm:p-10 rounded-[2.5rem] shadow-2xl shadow-teal-900/5 border border-slate-100 relative overflow-hidden"
                >
                  {/* Form Header */}
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <button 
                        onClick={() => setSelectedRole(null)}
                        className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 mb-2 group"
                      >
                        <ChevronRight size={14} className="rotate-180 group-hover:-translate-x-0.5 transition-transform" />
                        Back to roles
                      </button>
                      <h2 className="text-2xl font-bold text-slate-900">
                        {roles.find(r => r.id === selectedRole)?.title} Login
                      </h2>
                    </div>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${roles.find(r => r.id === selectedRole)?.color}`}>
                      {React.createElement(roles.find(r => r.id === selectedRole)?.icon || GraduationCap, { size: 24 })}
                    </div>
                  </div>

                  {/* Quick RBAC Credential Auto-Fill Buttons */}
                  <div className="mb-6 p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <ShieldCheck size={12} className="text-teal-600" />
                        Quick Test Accounts (RBAC)
                      </span>
                      <span className="text-[9px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                        Auto-Filled
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectRole('student')}
                        className={`px-2.5 py-2 rounded-xl text-xs font-bold transition-all text-left border ${
                          selectedRole === 'student'
                            ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-teal-300 hover:bg-teal-50/50'
                        }`}
                      >
                        <div className="font-bold flex items-center gap-1">🎓 Student</div>
                        <div className={`text-[10px] truncate ${selectedRole === 'student' ? 'text-teal-100' : 'text-slate-400'}`}>
                          student@enara.edu
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSelectRole('admin')}
                        className={`px-2.5 py-2 rounded-xl text-xs font-bold transition-all text-left border ${
                          selectedRole === 'admin'
                            ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-teal-300 hover:bg-teal-50/50'
                        }`}
                      >
                        <div className="font-bold flex items-center gap-1">🏛️ Admin</div>
                        <div className={`text-[10px] truncate ${selectedRole === 'admin' ? 'text-teal-100' : 'text-slate-400'}`}>
                          user@enara.edu
                        </div>
                      </button>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    {authError && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700"
                      >
                        <ShieldAlert size={20} className="text-red-600 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <h5 className="font-bold text-xs uppercase tracking-wider text-red-800">Access Prohibited</h5>
                          <p className="text-xs mt-1 text-red-700 leading-relaxed font-medium">{authError}</p>
                        </div>
                      </motion.div>
                    )}

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                      <div className="relative group">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-teal-500 transition-colors" size={18} />
                        <input 
                          type="email" 
                          required 
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="name@institution.edu"
                          className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:bg-white focus:border-teal-500 transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between ml-1">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Password</label>
                        <button type="button" className="text-xs font-bold text-teal-600 hover:text-teal-700">Forgot?</button>
                      </div>
                      <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-teal-500 transition-colors" size={18} />
                        <input 
                          type={showPassword ? 'text' : 'password'} 
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full pl-12 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:bg-white focus:border-teal-500 transition-all"
                        />
                        <button 
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 py-2">
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <div className="relative flex items-center justify-center">
                          <input type="checkbox" className="peer sr-only" />
                          <div className="w-5 h-5 border-2 border-slate-200 rounded-lg bg-white peer-checked:bg-teal-600 peer-checked:border-teal-600 transition-all"></div>
                          <ShieldCheck size={12} className="absolute text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                        </div>
                        <span className="text-sm text-slate-500 group-hover:text-slate-900 transition-colors">Remember this device</span>
                      </label>
                    </div>

                    <button 
                      disabled={isLoading}
                      className={`w-full py-4 bg-teal-600 text-white rounded-2xl font-bold shadow-lg shadow-teal-600/20 hover:bg-teal-700 hover:shadow-teal-600/30 transition-all flex items-center justify-center gap-2 relative overflow-hidden ${isLoading ? 'opacity-80 cursor-not-allowed' : 'active:scale-[0.98]'}`}
                    >
                      {isLoading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          <span>Authenticating...</span>
                        </>
                      ) : (
                        <>
                          <span>Sign In to Enara</span>
                          <ArrowRight size={18} />
                        </>
                      )}
                    </button>

                    <div className="pt-4 flex items-center gap-4">
                      <div className="flex-1 h-px bg-slate-100"></div>
                      <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Institutional SSO</span>
                      <div className="flex-1 h-px bg-slate-100"></div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button type="button" className="flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all">
                        <Globe size={16} /> Google
                      </button>
                      <button type="button" className="flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all">
                        <Zap size={16} /> Microsoft
                      </button>
                    </div>
                  </form>

                  {/* Subtle Background Detail */}
                  <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-teal-50 rounded-full blur-3xl opacity-50"></div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Footer Info */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className="mt-16 flex flex-col sm:flex-row items-center justify-between gap-6 px-4"
        >
          <div className="flex items-center gap-6 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
            <span>© 2026 Enara Intelligence</span>
            <span className="hidden sm:inline">•</span>
            <button className="hover:text-teal-600 transition-colors">Privacy Protocol</button>
            <span className="hidden sm:inline">•</span>
            <button className="hover:text-teal-600 transition-colors">Terms of Service</button>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-slate-200 overflow-hidden">
                  <img src={`https://picsum.photos/seed/user${i}/32/32`} alt="User" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
              ))}
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Trusted by <span className="text-teal-600">500+</span> Institutions
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
