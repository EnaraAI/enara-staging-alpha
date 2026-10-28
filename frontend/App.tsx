
import React, { useEffect, useState } from 'react';
import { Login } from './pages/Login';
import { StudentDashboard } from './pages/StudentDashboard';
import { CoursePage } from './pages/CoursePage';
import { AdminDashboard } from './pages/AdminDashboard';
import { CurriculumCenter } from './pages/CurriculumCenter';
import { StudentLayout, AdminSidebar, Header } from './components/Layout';
import { StudentManagement } from './pages/StudentManagement';
import { StudentProfile } from './pages/StudentProfile';
import { AIAssistant } from './components/AIAssistant';
import { ResearchInsights } from './pages/ResearchInsights';
import { LearningEvents } from './pages/LearningEvents';
import { LearningObjectives } from './pages/LearningObjectives';
import { ClassInsights } from './pages/ClassInsights';
import { SchoolInsights } from './pages/SchoolInsights';
import { StudentAssignments } from './pages/StudentAssignments';
import { StudyPlan } from './pages/StudyPlan';
import { AssessmentBuilder } from './pages/teaching/AssessmentBuilder';
import { ClassAssignments } from './pages/teaching/ClassAssignments';
import { GradingReview } from './pages/teaching/GradingReview';
import { TeachingDashboard } from './pages/teaching/TeachingDashboard';
import { LessonPlanner } from './pages/teaching/LessonPlanner';
import { AssessmentInterface } from './pages/AssessmentInterface';
import { AssessmentCenter } from './pages/AssessmentCenter';
import { ManagementDashboard } from './pages/ManagementDashboard';
import { AICredits } from './pages/AICredits';
import { EnaraAdminDashboard } from './pages/EnaraAdminDashboard';
import { EnaraCreditManagement } from './pages/EnaraCreditManagement';
import { TestResults } from './pages/TestResults';
import { RevenueGrowth } from './components/enara/RevenueGrowth';
import { InstitutionCRM } from './components/enara/InstitutionCRM';
import { ContractManagement } from './components/enara/ContractManagement';
import { PlatformHealth } from './components/enara/PlatformHealth';
import { AuditCompliance } from './components/enara/AuditCompliance';
import { ROIMetrics } from './components/enara/ROIMetrics';
import { Financials } from './components/enara/Financials';
import { InstitutionAnalytics } from './pages/InstitutionAnalytics';
import { CourseTeacherAnalytics } from './pages/CourseTeacherAnalytics';
import { StudentDeepAnalytics } from './pages/StudentDeepAnalytics';
import { Integrations } from '@/pages/Integrations';
import { AdminAvatarControlCenter } from './components/enara/AdminAvatarControlCenter';
import { fetchAssessments, fetchKnowledgeMap, fetchMyAssignments, fetchMyStudyPlan, fetchMyAssessments, fetchStudents, getSessionUser, logout, SESSION_EXPIRED_EVENT, SessionUser } from './services/apiService';
import { KnowledgeMap } from './pages/KnowledgeMap';
import { Documents } from './pages/workspace/Documents';
import { AIChat } from './pages/workspace/AIChat';
import { Outcomes } from './pages/workspace/Outcomes';
import { Usage } from './pages/workspace/Usage';
import { SavingsCenter } from './pages/workspace/SavingsCenter';
import { getSessionUser as sessionUser } from './services/apiService';
import { ACADEMIC_MANAGER_PAGES, academicManagerPage, restoreUiRole, UiRole } from './services/roleRouting';
import { Assessment, Student } from './types';
import { CheckCircle2 } from 'lucide-react';

type AppState = {
  role: UiRole | null;
  page: string;
  activeAssessment: Assessment | null;
  selectedStudent: Student | null;
  sharedCourseId?: string | null;
  sharedAssessmentId?: string | null;
  completedAssessmentIds: Set<string>;
};

// Which view (student / admin / enara-admin) the user signed in to.
const UI_ROLE_KEY = 'enara_ui_role';

const App: React.FC = () => {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [state, setState] = useState<AppState>(() => {
    const params = new URLSearchParams(window.location.search);
    const courseId = params.get('course');
    const assessmentId = params.get('assessment');
    
    // Clear the URL parameters so they don't persist on refresh or navigation
    if (courseId || assessmentId) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    const session = getSessionUser();
    const savedRole = (() => {
      try { return localStorage.getItem(UI_ROLE_KEY) as AppState['role']; } catch { return null; }
    })();
    // Only a portal the account may open; academic managers always get theirs.
    const role = restoreUiRole(session?.role, savedRole);
    return {
      role,
      page: role === 'student' && courseId ? 'courses' : 'dashboard',
      activeAssessment: null,
      selectedStudent: null,
      sharedCourseId: courseId,
      sharedAssessmentId: assessmentId,
      completedAssessmentIds: new Set<string>()
    };
  });

  const [userName, setUserName] = useState(() => {
    const session = getSessionUser();
    return session ? session.name || session.email : '';
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Load the signed-in user's data from the backend.
  React.useEffect(() => {
    // The academic manager portal loads only its own read-only analytics.
    if (!state.role || state.role === 'academic-manager') return;
    let cancelled = false;
    const loadAssessments = state.role === 'student' ? fetchMyAssessments : fetchAssessments;
    loadAssessments()
      .then(list => { if (!cancelled) setAssessments(list); })
      .catch(err => console.warn('Could not load assessments:', err));
    if (state.role !== 'student') {
      fetchStudents()
        .then(list => { if (!cancelled) setStudents(list); })
        .catch(err => console.warn('Could not load students:', err));
    }
    return () => { cancelled = true; };
  }, [state.role]);

  // Return to the login screen when the backend rejects the session.
  React.useEffect(() => {
    const onExpired = () => handleLogout();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  // Global navigation listener for Quick Jump links
  React.useEffect(() => {
    const handleEnaraNavigate = (e: any) => {
      const { page, assessmentId } = e.detail || {};
      if (assessmentId) {
        startAssessment(assessmentId);
      } else if (page) {
        navigate(page);
      }
    };
    window.addEventListener('enara-navigate', handleEnaraNavigate);
    return () => window.removeEventListener('enara-navigate', handleEnaraNavigate);
  }, [assessments, state.completedAssessmentIds]);

  const handleLogin = (role: UiRole, user: SessionUser) => {
    try { localStorage.setItem(UI_ROLE_KEY, role); } catch { /* storage unavailable */ }
    let page = role === 'student' && state.sharedCourseId ? 'courses' : 'dashboard';
    let activeAssessment = null;

    // If student and has a shared assessment, go directly to it
    if (role === 'student' && state.sharedAssessmentId) {
      if (state.completedAssessmentIds.has(state.sharedAssessmentId)) {
        alert('You have already completed this assessment. Shared assessments can only be opened once.');
      } else {
        const assessment = assessments.find(a => a.id === state.sharedAssessmentId);
        if (assessment) {
          page = 'taking-assessment';
          activeAssessment = assessment;
        }
      }
    }

    setState(prev => ({ ...prev, role, page, activeAssessment }));
    setUserName(user.name || user.email);
  };

  const handleLogout = () => {
    logout();
    try { localStorage.removeItem(UI_ROLE_KEY); } catch { /* storage unavailable */ }
    setAssessments([]);
    setStudents([]);
    setState(prev => ({ ...prev, role: null, page: 'courses', activeAssessment: null, selectedStudent: null }));
  };

  const openCourse = (courseId: string) => {
    setState(prev => ({ ...prev, page: 'courses', activeAssessment: null, selectedStudent: null, sharedCourseId: courseId }));
  };

  const navigate = (page: string) => {
    setState(prev => ({ 
      ...prev, 
      page, 
      activeAssessment: null, 
      selectedStudent: null, 
      // Only clear shared IDs if we're navigating to a different main area
      sharedCourseId: page === 'courses' ? prev.sharedCourseId : null,
      sharedAssessmentId: page === 'taking-assessment' ? prev.sharedAssessmentId : null
    }));
  };

  const viewStudentProfile = (student: Student) => {
    setState(prev => ({ ...prev, page: 'student-profile', selectedStudent: student }));
  };

  const viewStudentDeepAnalytics = (student: Student) => {
    setState(prev => ({ ...prev, page: 'student-analytics', selectedStudent: student }));
  };

  const startAssessment = (assessmentId: string) => {
    if (state.completedAssessmentIds.has(assessmentId)) {
      alert('You have already completed this assessment. Shared assessments can only be opened once.');
      return;
    }
    const assessment = assessments.find(a => a.id === assessmentId);
    if (assessment) {
      setState(prev => ({ ...prev, page: 'taking-assessment', activeAssessment: assessment }));
    }
  };

  const completeAssessment = (score: number) => {
    // The attempt was submitted to the backend; refresh so attempt status/score are current.
    if (state.role === 'student') {
      fetchMyAssessments()
        .then(list => setAssessments(list))
        .catch(err => console.warn('Could not refresh assessments:', err));
    }
    if (state.activeAssessment) {
      const id = state.activeAssessment.id;
      setState(prev => {
        const newCompleted = new Set(prev.completedAssessmentIds);
        newCompleted.add(id);
        return { ...prev, page: 'dashboard', activeAssessment: null, completedAssessmentIds: newCompleted };
      });
    } else {
      setState(prev => ({ ...prev, page: 'dashboard', activeAssessment: null }));
    }
  };

  const [isTutorOpen, setIsTutorOpen] = useState(false);
  const [tutorMessage, setTutorMessage] = useState<string | null>(null);
  const [tutorSessionId, setTutorSessionId] = useState<string | null>(null);

  // "My progress" tab: only when the school has learning intelligence on.
  const [progressEnabled, setProgressEnabled] = useState(false);
  useEffect(() => {
    if (state.role !== 'student') return setProgressEnabled(false);
    fetchKnowledgeMap().then(() => setProgressEnabled(true)).catch(() => setProgressEnabled(false));
  }, [state.role]);
  // "Assignments" tab: only when the school has the teaching workflow on.
  const [assignmentsEnabled, setAssignmentsEnabled] = useState(false);
  useEffect(() => {
    if (state.role !== 'student') return setAssignmentsEnabled(false);
    fetchMyAssignments().then(() => setAssignmentsEnabled(true)).catch(() => setAssignmentsEnabled(false));
  }, [state.role]);
  // "Study plan" tab: only when the school has study plans on.
  const [studyPlanEnabled, setStudyPlanEnabled] = useState(false);
  useEffect(() => {
    if (state.role !== 'student') return setStudyPlanEnabled(false);
    fetchMyStudyPlan().then(() => setStudyPlanEnabled(true)).catch(() => setStudyPlanEnabled(false));
  }, [state.role]);

  const handleAskTutor = (message: string, sessionId?: string) => {
    if (sessionId) setTutorSessionId(sessionId);
    setTutorMessage(message);
    setIsTutorOpen(true);
    // Clear message after passing it to prevent repeated triggers on state updates
    setTimeout(() => setTutorMessage(null), 100);
  };

  if (!state.role) {
    return (
      <Login 
        onLogin={handleLogin} 
        isSharedCourse={!!state.sharedCourseId} 
        isSharedAssessment={!!state.sharedAssessmentId}
      />
    );
  }

  if (state.role === 'student') {
    if (state.page === 'taking-assessment' && state.activeAssessment) {
      return (
        <div className="min-h-screen bg-slate-50">
          <AssessmentInterface 
            assessment={state.activeAssessment} 
            onComplete={completeAssessment}
            onAskTutor={handleAskTutor}
            onCancel={() => {
              if (state.sharedAssessmentId) {
                handleLogout();
              } else {
                navigate('dashboard');
              }
            }}
          />
        </div>
      );
    }

    // If it's a shared assessment link, we don't show the full layout with sidebar/tabs
    if (state.sharedAssessmentId && state.page === 'dashboard') {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-[2.5rem] p-10 shadow-xl border border-slate-100 text-center">
            <div className="w-20 h-20 bg-teal-50 text-teal-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 size={40} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Assessment Completed</h2>
            <p className="text-slate-500 mb-8">Thank you for completing the assessment. Your results have been recorded.</p>
            <button 
              onClick={handleLogout}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all"
            >
              Close and Logout
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <Header 
          role="student" 
          userName={userName} 
          onLogout={handleLogout} 
        />
        <div className="flex-1 flex overflow-hidden relative">
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Sub Navigation */}
            <div className="bg-white border-b border-gray-200 px-4 sm:px-8 py-2 overflow-x-auto whitespace-nowrap no-scrollbar shrink-0">
              <div className="flex gap-4 sm:gap-8">
                {[['dashboard', 'Home'], ['courses', 'My learning'], ...(progressEnabled ? [['progress', 'My progress']] : []), ...(assignmentsEnabled ? [['assignments-student', 'Assignments']] : []), ...(studyPlanEnabled ? [['study-plan', 'Study plan']] : []), ['assessments', 'Assessments'], ['results', 'Results']].map(([tab, label]) => (
                  <button
                    key={tab}
                    onClick={() => navigate(tab)}
                    className={`py-3 px-1 text-[15px] font-semibold transition-colors border-b-2 ${
                      state.page === tab 
                      ? 'border-teal-600 text-teal-700' 
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            
            <main className="flex-1 overflow-y-auto p-4 sm:p-8">
              {state.page === 'dashboard' && <StudentDashboard onStartAssessment={startAssessment} onNavigate={navigate} onOpenCourse={openCourse} onAskTutor={handleAskTutor} assessments={assessments} />}
              {state.page === 'courses' && <CoursePage initialCourseId={state.sharedCourseId} />}
              {state.page === 'progress' && <KnowledgeMap onAskTutor={handleAskTutor} onOpenCourses={() => navigate('courses')} />}
              {state.page === 'results' && <TestResults completedIds={state.completedAssessmentIds} onAskTutor={handleAskTutor} />}
              {state.page === 'assignments-student' && <StudentAssignments onAskTutor={handleAskTutor} />}
              {state.page === 'study-plan' && <StudyPlan onAskTutor={handleAskTutor} onNavigate={navigate} />}
              {state.page === 'assessments' && (
                <div className="p-8 max-w-7xl mx-auto">
                  <h2 className="text-2xl font-bold text-slate-900 mb-6">Your Assessments</h2>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {assessments.map(asm => {
                      // The backend only lets students start active or in-progress assessments.
                      const isOpen = asm.status === 'active' || asm.status === 'in-progress';
                      return (
                        <div key={asm.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                          <div className="flex justify-between items-start mb-4">
                            <span className="px-2 py-1 rounded-lg bg-teal-50 text-teal-700 text-[10px] font-bold uppercase tracking-wider">
                              {asm.subject}
                            </span>
                          </div>
                          <h3 className="font-bold text-slate-900 mb-1">{asm.title}</h3>
                          <p className="text-xs text-slate-500 mb-6">{asm.questions.length} Questions • {asm.duration} mins</p>
                          <button
                            onClick={() => startAssessment(asm.id)}
                            disabled={!isOpen}
                            className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"
                          >
                            {isOpen ? 'Start Assessment' : asm.status === 'completed' ? 'Closed' : 'Not open yet'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </main>
          </div>
          <AIAssistant 
            students={students} 
            assessments={assessments} 
            role="student"
            isOpen={isTutorOpen}
            onToggle={setIsTutorOpen}
            externalMessage={tutorMessage}
            externalSessionId={tutorSessionId}
            onNavigate={navigate}
            onStartAssessment={startAssessment}
          />
        </div>
      </div>
    );
  }

  if (state.role === 'academic-manager') {
    const page = academicManagerPage(state.page);
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header role="academic-manager" userName={userName} onLogout={handleLogout} />
        <div className="bg-white border-b border-gray-200 px-4 sm:px-8 py-2 flex gap-6">
          {ACADEMIC_MANAGER_PAGES.map(({ page: tab, label }) => (
            <button
              key={tab}
              onClick={() => navigate(tab)}
              className={`py-3 px-1 text-[15px] font-semibold border-b-2 ${page === tab ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <main className="flex-1 overflow-y-auto">
          {page === 'dashboard' && <InstitutionAnalytics />}
          {/* P4: read-only school outcome aggregates (no class filter, no student timeline). */}
          {page === 'dashboard' && <Outcomes allowClassFilter={false} showTimeline={false} />}
        </main>
      </div>
    );
  }

  if (state.role === 'enara-admin') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header 
          role="enara-admin" 
          userName={userName} 
          onLogout={handleLogout} 
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onBack={state.page !== 'dashboard' ? () => navigate('dashboard') : undefined}
        />
        <div className="flex-1 flex overflow-hidden relative">
          <AdminSidebar 
            activeTab={state.page} 
            onNavigate={navigate} 
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
            isEnaraAdmin={true}
            role="enara-admin"
          />
          <main className="flex-1 overflow-y-auto p-8">
            {state.page === 'dashboard' && <EnaraAdminDashboard onNavigate={navigate} />}
            {state.page === 'revenue' && <RevenueGrowth />}
            {state.page === 'institutions' && <InstitutionCRM onNavigate={navigate} />}
            {state.page === 'contracts' && <ContractManagement />}
            {state.page === 'health' && <PlatformHealth />}
            {state.page === 'roi' && <ROIMetrics />}
            {state.page === 'financials' && <Financials />}
            {state.page === 'audit' && <AuditCompliance />}
            {state.page === 'learning-events' && <LearningEvents />}
            {state.page === 'learning-objectives' && <LearningObjectives />}
            {state.page === 'class-insights' && <ClassInsights />}
            {state.page === 'school-insights' && <SchoolInsights isEnaraAdmin />}
            {state.page === 'credits' && <AICredits isEnaraAdmin={true} />}
            {state.page === 'credit-management' && <EnaraCreditManagement />}
            {state.page === 'integrations' && <Integrations />}
            {state.page === 'live-avatars' && <AdminAvatarControlCenter />}
            {state.page === 'settings' && <div className="p-20 text-center text-slate-400">Platform Global Settings</div>}
          </main>
          <AIAssistant 
            students={students} 
            assessments={assessments} 
            role="enara-admin"
            isOpen={isTutorOpen}
            onToggle={setIsTutorOpen}
            externalMessage={tutorMessage}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header 
        role="admin" 
        userName={userName} 
        onLogout={handleLogout} 
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onBack={state.page !== 'dashboard' ? () => navigate('dashboard') : undefined}
      />
      <div className="flex-1 flex overflow-hidden relative">
        <AdminSidebar 
          activeTab={state.page} 
          onNavigate={navigate} 
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          role="admin"
        />
        <main className="flex-1 overflow-y-auto">
          {state.page === 'dashboard' && <AdminDashboard onNavigate={navigate} students={students} setStudents={setStudents} onViewStudent={viewStudentProfile} onViewDeepAnalytics={viewStudentDeepAnalytics} />}
          {state.page === 'course-intelligence' && <CourseTeacherAnalytics onViewStudent={viewStudentDeepAnalytics} />}
          {state.page === 'institution-analytics' && <InstitutionAnalytics />}
          {state.page === 'student-analytics' && state.selectedStudent && (
            <StudentDeepAnalytics student={state.selectedStudent} onBack={() => navigate('dashboard')} />
          )}
          {state.page === 'partners' && <div className="p-20 text-center text-slate-400">Partner Management & CRM</div>}
          {state.page === 'programmes' && <div className="p-20 text-center text-slate-400">Programmes & Cohort Management</div>}
          {state.page === 'students' && (
            <StudentManagement 
              students={students} 
              setStudents={setStudents} 
              onViewStudent={viewStudentProfile} 
              onViewDeepAnalytics={viewStudentDeepAnalytics}
            />
          )}
          {(state.page === 'engagement' || state.page === 'analytics') && <ResearchInsights />}
          {state.page === 'learning-events' && <LearningEvents />}
          {state.page === 'learning-objectives' && <LearningObjectives />}
          {state.page === 'class-insights' && <ClassInsights />}
          {state.page === 'school-insights' && <SchoolInsights />}
          {state.page === 'documents' && <Documents />}
          {state.page === 'ai-chat' && <AIChat />}
          {state.page === 'outcomes' && <Outcomes />}
          {/* P5: Workspace Admin only; the server enforces workspace:billing too. */}
          {state.page === 'usage' && sessionUser()?.role === 'admin' && <Usage />}
          {state.page === 'savings' && sessionUser()?.role === 'admin' && <SavingsCenter />}
          {state.page === 'assessment-builder' && <AssessmentBuilder />}
          {state.page === 'class-assignments' && <ClassAssignments />}
          {state.page === 'grading' && <GradingReview />}
          {state.page === 'teaching' && <TeachingDashboard />}
          {state.page === 'lesson-planner' && <LessonPlanner />}
          {state.page === 'outcomes' && <div className="p-20 text-center text-slate-400">Learning Outcomes & Success Metrics</div>}
          {state.page === 'operations' && <div className="p-20 text-center text-slate-400">Operational Efficiency & Resource Management</div>}
          {state.page === 'integrations' && <Integrations />}
          {state.page === 'live-avatars' && <AdminAvatarControlCenter />}
          {state.page === 'governance' && <div className="p-20 text-center text-slate-400">Platform Governance & Security</div>}
          {state.page === 'compliance' && <div className="p-20 text-center text-slate-400">Accessibility & Compliance Audits</div>}
          {state.page === 'curriculum' && <CurriculumCenter />}
          {state.page === 'assignments' && <AssessmentCenter assessments={assessments} setAssessments={setAssessments} />}
          {state.page === 'credits' && <AICredits />}
          {state.page === 'settings' && <div className="p-20 text-center text-slate-400">Institution Configuration</div>}
          {state.page === 'student-profile' && state.selectedStudent && (
            <StudentProfile 
              student={state.selectedStudent} 
              onBack={() => navigate('students')} 
              onViewDeepAnalytics={() => viewStudentDeepAnalytics(state.selectedStudent!)}
            />
          )}
        </main>
        <AIAssistant 
          students={students} 
          assessments={assessments} 
          role="admin"
          isOpen={isTutorOpen}
          onToggle={setIsTutorOpen}
          externalMessage={tutorMessage}
          onNavigate={navigate}
        />
      </div>
    </div>
  );
};

export default App;
