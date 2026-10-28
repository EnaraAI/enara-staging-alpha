import {
  createTutorSession,
  sendTutorMessage,
  fetchMyCourses,
  fetchMyCourse,
  completeMyLesson,
  listTutorSessions,
  reportLessonViewed,
  getTutorSession,
  deleteTutorSession,
} from '../services/apiService';
import { toast } from '../services/toastService';
import React, { useState, useRef, useEffect } from 'react';
import { MessageContent } from '../components/MessageContent';
import {
  PlayCircle,
  Lock,
  BookOpen,
  FileText,
  ChevronRight,
  ChevronLeft,
  Menu,
  X,
  Bot,
  Volume2,
  Send,
  Video,
  File,
  Layers,
  HelpCircle,
  Mic,
  MicOff,
  Image as ImageIcon,
  Zap as ZapIcon,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  History,
  Download,
} from 'lucide-react';
import { Course, Lesson, Module, ChatMessage } from '../types';
import { getTutorResponse, generateSpeech, generateImage } from '../services/geminiService';
import { LiveAvatarModal } from '../components/enara/LiveAvatarModal';
import { UsageChip } from '../components/UsageChip';

interface CoursePageProps {
  initialCourseId?: string | null;
}

// GET /api/me/courses item
interface CourseSummary {
  id: string;
  title: string;
  subject: string;
  progressPct: number;
  modulesCount: number;
  lessonsCount: number;
  completedLessons: number;
}

// GET /api/me/tutor/sessions item
interface TutorSessionSummary {
  id: string;
  title: string;
  courseId?: string;
  lessonId?: string;
  lessonTitle?: string;
  messageCount: number;
  lastMessageAt?: string;
  mode?: 'chat' | 'voice';
}

// Tutor messages come back with ISO-string timestamps.
const toChatMessage = (m: any): ChatMessage => ({
  id: String(m.id),
  role: m.role === 'user' ? 'user' : 'ai',
  text: m.text || '',
  timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
});

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);


// Uploaded files come as signed /uploads/<uuid>-<name>?exp=…&sig=… links; show just the name.
const materialName = (mat: string) => mat.split('?')[0].split('/').pop()?.replace(/^[0-9a-f-]{36}-/i, '') || mat;

export const CoursePage: React.FC<CoursePageProps> = ({ initialCourseId }) => {
  const [view, setView] = useState<'selection' | 'overview' | 'lesson'>('selection');
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [isOpeningCourse, setIsOpeningCourse] = useState(false);
  const [isCompletingLesson, setIsCompletingLesson] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isTutorMinimized, setIsTutorMinimized] = useState(true);
  const [isLiveAvatarOpen, setIsLiveAvatarOpen] = useState(false);
  const [tutorView, setTutorView] = useState<'chat' | 'history'>('chat');
  
  // AI Tutor State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'ai', text: "Hi! I'm your Enara Learning Assistant. How can I help you today?", timestamp: new Date() }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isReadingId, setIsReadingId] = useState<string | null>(null);
  const [tutorSessionId, setTutorSessionId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  // History state (backend tutor sessions for the selected course)
  const [sessions, setSessions] = useState<TutorSessionSummary[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputText(prev => prev + (prev ? ' ' : '') + transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (error) {
        console.error('Speech recognition start error:', error);
      }
    }
  };

  const handleVisualize = async () => {
    const text = `Can you draw a visualization for the current concept we're discussing? Please provide a high-level visual representation of the key ideas.`;
    
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text, timestamp: new Date() };
    setChatMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    const lessonContext = selectedLesson 
      ? `Subject: ${selectedCourse?.subject}, Module: ${selectedModule?.title}, Lesson: ${selectedLesson.title}.`
      : `Subject: ${selectedCourse?.subject}.`;

    const prompt = `Based on the lesson "${selectedLesson?.title || selectedCourse?.title}", generate a prompt for an educational illustration that helps visualize the core concept. The prompt should be descriptive and educational. Return ONLY the JSON object with the "prompt" field.`;
    
    const response = await getTutorResponse([], prompt, lessonContext).catch(() => '');
    let imagePrompt = response;
    try {
      // Try to parse if it's JSON
      const parsed = JSON.parse(response);
      imagePrompt = parsed.prompt || response;
    } catch (e) {
      // Fallback to raw text
    }

    const imageUrl = await generateImage(imagePrompt, "16:9");
    
    setIsTyping(false);
    
    if (imageUrl) {
      setChatMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        role: 'ai', 
        text: "Here's a visualization of the concept. I hope this helps you understand it better!", 
        timestamp: new Date(),
        imageUrl,
        imagePrompt
      }]);
    } else {
      setChatMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        role: 'ai', 
        text: "Pictures aren't available in text chat yet. Ask the live tutor to draw it: it can show diagrams during a call.", 
        timestamp: new Date() 
      }]);
      await handleSendMessage("Explain the concept in detail.");
    }
  };

  const handleQuickAssessment = async () => {
    const prompt = `I'd like a quick assessment to test my knowledge of this lesson "${selectedLesson?.title}". Please give me 3-5 challenging questions.`;
    await handleSendMessage(prompt);
  };

  const loadCourses = async () => {
    setIsLoadingCourses(true);
    setCoursesError(null);
    try {
      const list = await fetchMyCourses();
      setCourses(Array.isArray(list) ? list : []);
    } catch (err) {
      const message = errorMessage(err, 'Could not load your courses.');
      setCoursesError(message);
      toast.error('Courses unavailable', message);
    } finally {
      setIsLoadingCourses(false);
    }
  };

  // Loads the full course tree (modules + lessons + progress) and opens its overview.
  const openCourse = async (courseId: string) => {
    setIsOpeningCourse(true);
    try {
      const course = (await fetchMyCourse(courseId)) as Course;
      setSelectedCourse(course);
      setSelectedModule(null);
      setSelectedLesson(null);
      setTutorSessionId(null);
      setView('overview');
    } catch (err) {
      toast.error('Course unavailable', errorMessage(err, 'Could not open this course.'));
    } finally {
      setIsOpeningCourse(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    if (initialCourseId) openCourse(initialCourseId);
  }, [initialCourseId]);

  // Time on a lesson (only while the tab is visible), reported when the student
  // leaves it. Stored as unverified evidence: the browser reports it.
  useEffect(() => {
    const courseId = selectedCourse?.id;
    const lessonId = selectedLesson?.id;
    if (!courseId || !lessonId) return;
    let visibleMs = 0;
    let since: number | null = document.visibilityState === 'visible' ? Date.now() : null;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') since = Date.now();
      else if (since !== null) {
        visibleMs += Date.now() - since;
        since = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (since !== null) visibleMs += Date.now() - since;
      if (visibleMs >= 5000) void reportLessonViewed(courseId, lessonId, visibleMs).catch(() => {});
    };
  }, [selectedCourse?.id, selectedLesson?.id]);

  const loadSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const list = (await listTutorSessions()) as TutorSessionSummary[];
      // Live calls started outside a course show in every course's history.
      setSessions((Array.isArray(list) ? list : []).filter(s => !selectedCourse || s.courseId === selectedCourse.id || (s.mode === 'voice' && !s.courseId)));
    } catch (err) {
      toast.error('Chat history unavailable', errorMessage(err, 'Could not load your tutor sessions.'));
    } finally {
      setIsLoadingSessions(false);
    }
  };

  useEffect(() => {
    if (tutorView === 'history') loadSessions();
  }, [tutorView, selectedCourse?.id]);

  const openSession = async (id: string) => {
    try {
      const session: any = await getTutorSession(id);
      setChatMessages((session.messages || []).map(toChatMessage));
      setTutorSessionId(session.id || id);
      setTutorView('chat');
    } catch (err) {
      toast.error('Could not open chat', errorMessage(err, 'Failed to load this tutor session.'));
    }
  };

  const clearSessions = async () => {
    try {
      await Promise.all(sessions.map(s => deleteTutorSession(s.id)));
      if (tutorSessionId && sessions.some(s => s.id === tutorSessionId)) setTutorSessionId(null);
      setSessions([]);
    } catch (err) {
      toast.error('Could not clear history', errorMessage(err, 'Failed to delete tutor sessions.'));
      loadSessions();
    }
  };

  useEffect(() => {
    // Scroll only the chat thread; scrollIntoView would also scroll the page's own containers.
    const thread = chatEndRef.current?.parentElement;
    if (thread) thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });
  }, [chatMessages, isTyping]);

  useEffect(() => {
    setQuizAnswers({});
    setQuizSubmitted(false);
  }, [selectedLesson?.id]);

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputText;
    if (!textToSend.trim()) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: textToSend, timestamp: new Date() };
    setChatMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    let response: string;
    try {
      let sessionId = tutorSessionId;
      if (!sessionId) {
        const session: any = await createTutorSession(selectedCourse?.id, selectedLesson?.id);
        sessionId = session.id as string;
        setTutorSessionId(sessionId);
      }
      const result: any = await sendTutorMessage(sessionId, textToSend, {
        courseId: selectedCourse?.id,
        lessonId: selectedLesson?.id,
        subject: selectedCourse?.subject,
        lessonTitle: selectedLesson?.title,
      });
      response = result.assistantMessage?.text || 'No response received.';
    } catch (err) {
      const message = errorMessage(err, 'The tutor is unavailable right now.');
      toast.error('AI Tutor error', message);
      response = `Sorry, I couldn't reach the tutor: ${message}`;
    }

    setIsTyping(false);
    setChatMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'ai', text: response, timestamp: new Date() }]);
  };

  const handleReadAloud = async (message: ChatMessage) => {
    if (isReadingId === message.id) {
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      setIsReadingId(null);
      return;
    }

    setIsReadingId(message.id);
    const audioData = await generateSpeech(message.text);
    
    if (audioData) {
      const decodedData = atob(audioData);
      const uint8Array = new Uint8Array(decodedData.length);
      for (let i = 0; i < decodedData.length; i++) {
        uint8Array[i] = decodedData.charCodeAt(i);
      }

      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      const ctx = audioContextRef.current;
      const dataInt16 = new Int16Array(uint8Array.buffer);
      const audioBuffer = ctx.createBuffer(1, dataInt16.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < dataInt16.length; i++) {
        channelData[i] = dataInt16[i] / 32768.0;
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => setIsReadingId(null);
      source.start();
    } else {
      setIsReadingId(null);
      toast.info('Read aloud is not available yet', 'Use the live tutor to hear explanations spoken.');
    }
  };

  const handleStartLesson = (module: Module, lesson: Lesson) => {
    // Previous chats are already stored on the backend; start a fresh tutor session for this lesson.
    setTutorSessionId(null);
    setSelectedModule(module);
    setSelectedLesson(lesson);
    setView('lesson');
    setIsSidebarOpen(false);
    setTutorView('chat');
    setChatMessages([
      { id: '1', role: 'ai', text: `Welcome to **${lesson.title}**! I'm here to help you master this topic. What would you like to start with?`, timestamp: new Date() }
    ]);
  };

  const calculateOverallProgress = (course: Course) => {
    if (!course || !course.modules || course.modules.length === 0) return 0;
    const totalLessons = course.modules.reduce((acc, m) => acc + (m?.lessonsCount || 0), 0);
    if (totalLessons === 0) return 0;
    const completedLessons = course.modules.reduce((acc, m) => acc + (m?.completedLessons || 0), 0);
    return Math.round((completedLessons / totalLessons) * 100);
  };

  const handleSelectCourse = (course: CourseSummary) => {
    if (!isOpeningCourse) openCourse(course.id);
  };

  // Marks the current lesson complete on the backend, then moves to the next lesson if there is one.
  const handleCompleteLesson = async () => {
    if (!selectedCourse || !selectedLesson) return;
    setIsCompletingLesson(true);
    try {
      const updated = (await completeMyLesson(selectedCourse.id, selectedLesson.id)) as Course;
      setSelectedCourse(updated);
      setCourses(prev => prev.map(c => (c.id === updated.id
        ? {
            ...c,
            progressPct: calculateOverallProgress(updated),
            completedLessons: updated.modules.reduce((acc, m) => acc + (m.completedLessons || 0), 0),
          }
        : c)));

      const ordered = updated.modules.flatMap(m => m.lessons.map(l => ({ module: m, lesson: l })));
      const idx = ordered.findIndex(x => x.lesson.id === selectedLesson.id);
      const next = idx >= 0 ? ordered[idx + 1] : undefined;
      if (next && next.lesson.status !== 'locked') {
        handleStartLesson(next.module, next.lesson);
      } else {
        const current = ordered[idx];
        if (current) {
          setSelectedModule(current.module);
          setSelectedLesson(current.lesson);
        }
        toast.success('Lesson completed', next ? 'Nice work!' : 'You have finished every lesson in this course.');
      }
    } catch (err) {
      toast.error('Could not complete lesson', errorMessage(err, 'Please try again.'));
    } finally {
      setIsCompletingLesson(false);
    }
  };

  if (view === 'selection') {
    return (
      <div className="min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 lg:mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-1">My learning</h1>
            <p className="text-sm text-slate-600">Pick up where you left off or start something new.</p>
          </div>

          {isLoadingCourses && (
            <div className="flex items-center gap-2 text-sm text-slate-600 py-12 justify-center">
              <Sparkles size={16} className="animate-spin text-teal-600" /> Loading your courses...
            </div>
          )}
          {!isLoadingCourses && coursesError && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-6 text-center">
              <AlertCircle size={24} className="text-rose-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-rose-800">We couldn't load your courses.</p>
              <p className="text-xs text-rose-700 mt-1">{coursesError}</p>
              <button onClick={loadCourses} className="mt-4 px-4 py-2 rounded-md bg-rose-600 text-white text-xs font-bold hover:bg-rose-700">
                Try again
              </button>
            </div>
          )}
          {!isLoadingCourses && !coursesError && courses.length === 0 && (
            <div className="bg-white rounded-lg border border-[#e5e7eb] p-10 text-center">
              <BookOpen size={28} className="text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-800">You're not enrolled in any courses yet.</p>
              <p className="text-xs text-slate-600 mt-1">Courses assigned to you by your institution will appear here.</p>
            </div>
          )}
          {isOpeningCourse && (
            <p className="text-sm text-teal-700 font-bold mb-4" role="status">Opening course...</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
            {courses.map(course => {
              const progress = course.progressPct || 0;
              const tile = TILE_COLORS[hashIndex(course.subject || course.title, TILE_COLORS.length)];
              return (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => handleSelectCourse(course)}
                  disabled={isOpeningCourse}
                  className="text-left bg-white rounded-lg border border-[#e5e7eb] overflow-hidden hover:shadow-md hover:border-slate-300 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-70 group"
                >
                  <div className={`h-28 flex items-center justify-center ${tile}`}>
                    <span className="text-3xl font-bold text-white tracking-wide">{initials(course.subject || course.title)}</span>
                  </div>
                  <div className="p-4">
                    <p className="text-xs font-semibold text-slate-600 mb-1 truncate">{course.subject}</p>
                    <h3 className="text-base font-bold text-slate-900 leading-snug mb-3 group-hover:text-teal-700 group-hover:underline line-clamp-2">
                      {course.title}
                    </h3>
                    <p className="text-xs text-slate-600 mb-2">
                      {course.completedLessons || 0} of {course.lessonsCount || 0} lessons · {progress}%
                    </p>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${course.title} progress`}>
                      <div className="h-full bg-teal-600 rounded-full" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (!selectedCourse) return null;

  const overallProgress = calculateOverallProgress(selectedCourse);
  const orderedLessons = selectedCourse.modules.flatMap(m => m.lessons.map(l => ({ module: m, lesson: l })));
  const currentIdx = selectedLesson ? orderedLessons.findIndex(x => x.lesson.id === selectedLesson.id) : -1;
  const nextEntry = currentIdx >= 0 ? orderedLessons[currentIdx + 1] : undefined;
  const nextAvailable = nextEntry && nextEntry.lesson.status !== 'locked' ? nextEntry : undefined;
  const resumeEntry =
    orderedLessons.find(x => x.lesson.status !== 'locked' && x.lesson.status !== 'completed') ||
    orderedLessons.find(x => x.lesson.status !== 'locked');
  const totalLessons = selectedCourse.modules.reduce((acc, m) => acc + (m.lessonsCount || 0), 0);
  const doneLessons = selectedCourse.modules.reduce((acc, m) => acc + (m.completedLessons || 0), 0);

  // ---------- Left: course outline ----------
  const outline = (
    <nav aria-label="Course outline" className="p-4">
      <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3 px-2">Course outline</h3>
      <div className="space-y-4">
        {selectedCourse.modules.map((module, mIdx) => (
          <div key={module.id}>
            {selectedCourse.modules.length > 1 && (
              <p className="px-2 mb-1 text-xs font-semibold text-slate-700">
                {mIdx + 1}. {module.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {module.lessons.map(lesson => {
                const isCurrent = selectedLesson?.id === lesson.id;
                const isLocked = lesson.status === 'locked';
                const isDone = lesson.status === 'completed';
                return (
                  <li key={lesson.id}>
                    <button
                      type="button"
                      onClick={() => handleStartLesson(module, lesson)}
                      disabled={isLocked}
                      aria-current={isCurrent ? 'step' : undefined}
                      className={`w-full flex items-start gap-2.5 px-2 py-2 rounded-md text-left text-sm transition-colors ${
                        isCurrent
                          ? 'bg-teal-50 text-teal-700 font-bold'
                          : isLocked
                          ? 'text-slate-500 cursor-not-allowed'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="mt-0.5 shrink-0">
                        {isDone ? (
                          <CheckCircle2 size={16} className="text-emerald-600" aria-label="Completed" />
                        ) : isLocked ? (
                          <Lock size={16} className="text-slate-400" aria-label="Locked" />
                        ) : (
                          <PlayCircle size={16} className={isCurrent ? 'text-teal-600' : 'text-slate-400'} aria-hidden="true" />
                        )}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block leading-snug">{lesson.order} · {lesson.title}</span>
                        {lesson.duration && <span className="block text-xs font-normal text-slate-600">{lesson.duration}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );

  // ---------- Right: AI tutor panel ----------
  const tutorPanel = (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-3 border-b border-[#e5e7eb] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-md bg-teal-600 text-white flex items-center justify-center shrink-0">
            <Sparkles size={15} aria-hidden="true" />
          </div>
          <h4 className="text-sm font-bold text-slate-900">AI tutor</h4>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsLiveAvatarOpen(true)}
            className="px-2 py-1.5 rounded-md border border-[#e5e7eb] text-teal-700 text-xs font-bold flex items-center gap-1.5 hover:bg-teal-50 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-pulse" aria-hidden="true" />
            Live AI Tutor
          </button>
          <button
            type="button"
            onClick={() => setTutorView(tutorView === 'chat' ? 'history' : 'chat')}
            className={`p-1.5 rounded-md transition-colors ${tutorView === 'history' ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-100'}`}
            aria-label={tutorView === 'history' ? 'Back to chat' : 'Chat history'}
            aria-pressed={tutorView === 'history'}
          >
            <History size={16} />
          </button>
          <button
            type="button"
            onClick={() => setIsTutorMinimized(true)}
            className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="Hide AI tutor"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {tutorView === 'chat' ? (
          <>
            {chatMessages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === 'user' ? 'bg-teal-600 text-white' : 'bg-slate-50 text-slate-800 border border-[#e5e7eb]'
                  }`}
                >
                  {msg.role === 'user' ? msg.text : <MessageContent text={msg.text} />}
                  {msg.imageUrl && (
                    <div className="mt-3 rounded-md overflow-hidden border border-[#e5e7eb] bg-white">
                      <img
                        src={msg.imageUrl}
                        alt={msg.imagePrompt || 'Visualization'}
                        className="w-full h-auto object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  )}
                  {msg.role === 'ai' && (
                    <div className="mt-2 pt-2 border-t border-[#e5e7eb] flex items-center">
                      <button
                        type="button"
                        onClick={() => handleReadAloud(msg)}
                        className={`p-1 rounded-md transition-colors ${isReadingId === msg.id ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-white'}`}
                        aria-label={isReadingId === msg.id ? 'Stop reading aloud' : 'Read aloud'}
                      >
                        <Volume2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start" role="status">
                <div className="bg-slate-50 border border-[#e5e7eb] rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-slate-600">
                  <span className="flex gap-1" aria-hidden="true">
                    <span className="w-1.5 h-1.5 bg-teal-600 rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-teal-600 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                    <span className="w-1.5 h-1.5 bg-teal-600 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                  </span>
                  Tutor is thinking...
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Recent sessions</h5>
              {sessions.length > 0 && (
                <button type="button" onClick={clearSessions} className="text-xs font-bold text-rose-700 hover:underline">
                  Clear all
                </button>
              )}
            </div>
            {isLoadingSessions ? (
              <p className="text-sm text-slate-600 text-center py-10">Loading chat history...</p>
            ) : sessions.length === 0 ? (
              <div className="text-center py-10">
                <History size={22} className="mx-auto mb-2 text-slate-400" aria-hidden="true" />
                <p className="text-sm text-slate-600">No chat history yet.</p>
              </div>
            ) : (
              sessions.map(session => (
                <button
                  type="button"
                  key={session.id}
                  onClick={() => openSession(session.id)}
                  className="w-full text-left p-3 rounded-md border border-[#e5e7eb] hover:border-teal-300 hover:bg-teal-50 transition-colors"
                >
                  <div className="flex justify-between items-start gap-2 mb-0.5">
                    <p className="text-sm font-bold text-slate-900 truncate">{session.title}</p>
                    <span className="text-xs text-slate-600 whitespace-nowrap">
                      {session.lastMessageAt ? new Date(session.lastMessageAt).toLocaleDateString() : ''}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2">
                    {session.mode === 'voice' && <span className="font-bold text-teal-700">Live call transcript · </span>}
                    {session.lessonTitle ? `${session.lessonTitle} · ` : ''}{session.messageCount} messages
                  </p>
                </button>
              ))
            )}
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {tutorView === 'chat' && (
        <div className="p-3 border-t border-[#e5e7eb] space-y-2 shrink-0">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={handleVisualize}
              className="whitespace-nowrap px-2.5 py-1 rounded-md border border-[#e5e7eb] text-slate-700 text-xs font-semibold hover:bg-slate-50 flex items-center gap-1.5"
            >
              <ImageIcon size={13} aria-hidden="true" /> Visualize
            </button>
            {selectedLesson && (
              <button
                type="button"
                onClick={handleQuickAssessment}
                className="whitespace-nowrap px-2.5 py-1 rounded-md border border-[#e5e7eb] text-slate-700 text-xs font-semibold hover:bg-slate-50 flex items-center gap-1.5"
              >
                <ZapIcon size={13} aria-hidden="true" /> Quick assessment
              </button>
            )}
          </div>
          <div className="flex items-end gap-2">
            <label htmlFor="tutor-input" className="sr-only">Message the AI tutor</label>
            <textarea
              id="tutor-input"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
              placeholder="Message"
              rows={1}
              className="flex-1 min-w-0 border border-[#d1d5db] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600/30 focus:border-teal-600 resize-none max-h-32"
            />
            <button
              type="button"
              onClick={toggleListening}
              className={`p-2 rounded-md border transition-colors ${isListening ? 'bg-rose-600 border-rose-600 text-white animate-pulse' : 'border-[#e5e7eb] text-slate-600 hover:bg-slate-50'}`}
              aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
              aria-pressed={isListening}
            >
              {isListening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim()}
              className="px-3 py-2 rounded-md bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Send size={14} aria-hidden="true" /> Send
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col lg:h-full lg:min-h-[560px] bg-white border border-[#e5e7eb] rounded-lg overflow-hidden">
      {/* Course title bar */}
      <div className="px-4 sm:px-6 py-3 border-b border-[#e5e7eb] flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={() => setView('selection')}
          className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100 shrink-0"
          aria-label="Back to my learning"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">{selectedCourse.title}</h2>
          <UsageChip features={['avatar_session', 'stt', 'tts', 'avatar_visual']} label="Tutor calls" />
          <div className="flex items-center gap-2 mt-1">
            <div className="h-1.5 w-28 sm:w-40 bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={overallProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Course progress">
              <div className="h-full bg-teal-600 rounded-full" style={{ width: `${overallProgress}%` }} />
            </div>
            <span className="text-xs text-slate-600 whitespace-nowrap">Course progress {overallProgress}%</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#e5e7eb] text-slate-700 text-xs font-bold hover:bg-slate-50 shrink-0"
          aria-expanded={isSidebarOpen}
          aria-controls="course-outline"
        >
          <Menu size={14} aria-hidden="true" /> Outline
        </button>
        <button
          type="button"
          onClick={() => setIsTutorMinimized(!isTutorMinimized)}
          className="lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#e5e7eb] text-slate-700 text-xs font-bold hover:bg-slate-50 shrink-0"
          aria-expanded={!isTutorMinimized}
          aria-controls="ai-tutor-panel"
        >
          <Bot size={14} aria-hidden="true" /> Tutor
        </button>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        {/* Left: outline */}
        <aside
          id="course-outline"
          className={`${isSidebarOpen ? 'block' : 'hidden'} lg:block lg:w-64 xl:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-[#e5e7eb] lg:overflow-y-auto max-h-80 lg:max-h-none overflow-y-auto`}
        >
          {outline}
        </aside>

        {/* Centre: lesson */}
        <main className="flex-1 min-w-0 lg:overflow-y-auto">
          {view === 'overview' || !selectedLesson ? (
            <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
              <p className="text-sm text-slate-600 mb-1">{selectedCourse.subject}</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">{selectedCourse.title}</h1>
              <p className="text-sm text-slate-700 mb-6">
                {selectedCourse.modules.length} {selectedCourse.modules.length === 1 ? 'module' : 'modules'} · {totalLessons} lessons · {doneLessons} completed
              </p>
              {resumeEntry ? (
                <button
                  type="button"
                  onClick={() => handleStartLesson(resumeEntry.module, resumeEntry.lesson)}
                  className="px-5 py-2.5 rounded-md bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 flex items-center gap-2"
                >
                  {doneLessons > 0 ? 'Continue' : 'Start'}: {resumeEntry.lesson.title}
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              ) : (
                <p className="text-sm text-slate-600">No lessons are available yet.</p>
              )}

              <div className="mt-8 pt-6 border-t border-[#e5e7eb]">
                <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <FileText size={16} className="text-teal-600" aria-hidden="true" /> Course resources
                </h3>
                {!selectedCourse.modules[0]?.materials?.length ? (
                  <p className="text-sm text-slate-600">No resources have been uploaded for this course yet.</p>
                ) : (
                  <ul className="divide-y divide-[#e5e7eb] border border-[#e5e7eb] rounded-md">
                    {selectedCourse.modules[0].materials.map((mat, i) => (
                      <li key={i} className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-800">
                        <File size={16} className="text-slate-500" aria-hidden="true" /> {materialName(mat)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <article className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
              <p className="text-sm text-slate-600 mb-1">
                Lesson {selectedLesson.order}
                {selectedLesson.duration ? ` · ${selectedLesson.duration}` : ''}
                {selectedModule?.title ? ` · ${selectedModule.title}` : ''}
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight mb-6">{selectedLesson.title}</h1>

              {selectedLesson.videoUrl && (
                <div className="mb-8">
                  <div className="aspect-video w-full bg-slate-900 rounded-lg overflow-hidden">
                    <iframe
                      src={selectedLesson.videoUrl}
                      title={selectedLesson.title}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                  <div className="flex justify-end mt-2">
                    <button
                      type="button"
                      onClick={() => handleSendMessage(`I'm watching the video for "${selectedLesson.title}". Can you explain the key takeaways?`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-teal-700 text-sm font-semibold hover:bg-teal-50"
                    >
                      <Bot size={14} aria-hidden="true" /> Ask tutor about this video
                    </button>
                  </div>
                </div>
              )}

              <div className="text-slate-800 leading-relaxed space-y-4 mb-8">
                {selectedModule?.explanation && (
                  <p className="border-l-4 border-teal-600 bg-teal-50 px-4 py-3 rounded-r-md text-slate-700">
                    {selectedModule.explanation}
                  </p>
                )}
                {selectedLesson.content ? (
                  <p className="whitespace-pre-line">{selectedLesson.content}</p>
                ) : (
                  <p>In this lesson, we dive deep into the core concepts of {selectedLesson.title}. Use the AI tutor if you need any clarification or extra practice problems.</p>
                )}
              </div>

              {selectedLesson.quiz && (
                <section className="mb-8 border border-[#e5e7eb] rounded-lg p-5 sm:p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <HelpCircle size={20} className="text-teal-600" aria-hidden="true" />
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Knowledge check</h3>
                      <p className="text-sm text-slate-600">Test your understanding of {selectedLesson.title}</p>
                    </div>
                  </div>
                  <div className="space-y-6">
                    {selectedLesson.quiz.questions.map((q, qIdx) => (
                      <div key={q.id} className="space-y-2">
                        <p className="text-sm font-bold text-slate-900">{qIdx + 1}. {q.text}</p>
                        <div className="grid grid-cols-1 gap-2">
                          {q.options.map((opt, optIdx) => {
                            const isSelected = quizAnswers[q.id] === optIdx;
                            const isCorrect = q.correctAnswer === optIdx;
                            return (
                              <button
                                type="button"
                                key={optIdx}
                                disabled={quizSubmitted}
                                onClick={() => setQuizAnswers(prev => ({ ...prev, [q.id]: optIdx }))}
                                aria-pressed={isSelected}
                                className={`w-full text-left px-3 py-2.5 rounded-md border text-sm flex items-center justify-between gap-2 transition-colors ${
                                  quizSubmitted
                                    ? isCorrect
                                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                      : isSelected
                                        ? 'bg-rose-50 border-rose-300 text-rose-800'
                                        : 'bg-white border-[#e5e7eb] text-slate-600'
                                    : isSelected
                                      ? 'bg-teal-50 border-teal-600 text-teal-800 font-semibold'
                                      : 'bg-white border-[#e5e7eb] text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <span>{opt}</span>
                                {quizSubmitted && isCorrect && <CheckCircle2 size={16} className="text-emerald-600 shrink-0" aria-label="Correct answer" />}
                                {quizSubmitted && isSelected && !isCorrect && <AlertCircle size={16} className="text-rose-600 shrink-0" aria-label="Your answer, incorrect" />}
                              </button>
                            );
                          })}
                        </div>
                        {quizSubmitted && quizAnswers[q.id] !== undefined && (
                          <p className={`p-3 rounded-md text-sm ${quizAnswers[q.id] === q.correctAnswer ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-50 text-slate-700'}`}>
                            <span className="font-bold mr-1">Explanation:</span>{q.explanation}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  {!quizSubmitted ? (
                    <button
                      type="button"
                      onClick={() => {
                        setQuizSubmitted(true);
                        const correctCount = selectedLesson.quiz!.questions.filter(q => quizAnswers[q.id] === q.correctAnswer).length;
                        handleSendMessage(`I just finished the quiz for "${selectedLesson.title}". I got ${correctCount} out of ${selectedLesson.quiz!.questions.length} correct. Can you help me review the parts I missed?`);
                      }}
                      disabled={Object.keys(quizAnswers).length < selectedLesson.quiz.questions.length}
                      className="mt-6 px-5 py-2.5 rounded-md bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 disabled:opacity-50"
                    >
                      Submit quiz
                    </button>
                  ) : (
                    <div className="mt-6 pt-4 border-t border-[#e5e7eb] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <p className="text-sm text-slate-800">
                        <span className="font-bold">
                          {selectedLesson.quiz.questions.filter(q => quizAnswers[q.id] === q.correctAnswer).length}/{selectedLesson.quiz.questions.length} correct.
                        </span>{' '}
                        Your results have been shared with your AI tutor.
                      </p>
                      <button
                        type="button"
                        onClick={() => { setQuizAnswers({}); setQuizSubmitted(false); }}
                        className="px-4 py-2 rounded-md border border-teal-600 text-teal-700 text-sm font-bold hover:bg-teal-50"
                      >
                        Retake quiz
                      </button>
                    </div>
                  )}
                </section>
              )}

              {selectedLesson.materials && selectedLesson.materials.length > 0 && (
                <section className="mb-8">
                  <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <Layers size={16} className="text-teal-600" aria-hidden="true" /> Lesson materials
                  </h3>
                  <ul className="divide-y divide-[#e5e7eb] border border-[#e5e7eb] rounded-md">
                    {selectedLesson.materials.map((mat, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <span className="flex items-center gap-2.5 text-sm text-slate-800 min-w-0">
                          {materialName(mat).endsWith('.mp4') ? <Video size={16} className="text-slate-500 shrink-0" aria-hidden="true" /> : <FileText size={16} className="text-slate-500 shrink-0" aria-hidden="true" />}
                          <span className="truncate">{materialName(mat)}</span>
                        </span>
                        {mat.startsWith('/uploads/') && (
                          <a href={mat} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100 hover:text-teal-700" aria-label={`Open ${materialName(mat)}`}>
                            <Download size={14} />
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="pt-6 border-t border-[#e5e7eb] flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleCompleteLesson}
                  disabled={isCompletingLesson || selectedLesson.status === 'completed'}
                  className="px-5 py-2.5 rounded-md bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {selectedLesson.status === 'completed' && <CheckCircle2 size={16} aria-hidden="true" />}
                  {isCompletingLesson ? 'Saving...' : selectedLesson.status === 'completed' ? 'Completed' : 'Mark complete'}
                </button>
                <button
                  type="button"
                  onClick={() => nextAvailable && handleStartLesson(nextAvailable.module, nextAvailable.lesson)}
                  disabled={!nextAvailable}
                  className="px-5 py-2.5 rounded-md border border-teal-600 text-teal-700 text-sm font-bold hover:bg-teal-50 disabled:opacity-50 disabled:hover:bg-transparent flex items-center justify-center gap-1.5"
                >
                  Next lesson <ChevronRight size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setView('overview')}
                  className="sm:ml-auto px-3 py-2.5 rounded-md text-slate-700 text-sm font-semibold hover:bg-slate-50"
                >
                  Course overview
                </button>
              </div>
            </article>
          )}
        </main>

        {/* Right: AI tutor */}
        <aside
          id="ai-tutor-panel"
          aria-label="AI tutor"
          className={`${isTutorMinimized ? 'hidden' : 'flex'} lg:flex flex-col h-[520px] lg:h-auto lg:w-80 xl:w-96 shrink-0 border-t lg:border-t-0 lg:border-l border-[#e5e7eb]`}
        >
          {tutorPanel}
        </aside>
      </div>

      {/* Live AI Avatar Streaming Modal */}
      <LiveAvatarModal
        isOpen={isLiveAvatarOpen}
        onClose={() => setIsLiveAvatarOpen(false)}
        lessonTitle={selectedLesson?.title || selectedCourse?.title || "Active Course Session"}
        subject={selectedCourse?.subject || "Academic"}
        courseId={selectedCourse?.id}
        lessonId={selectedLesson?.id}
        isStudent={true}
      />
    </div>
  );
};

const TILE_COLORS = ['bg-teal-600', 'bg-emerald-700', 'bg-violet-700', 'bg-amber-700', 'bg-rose-700', 'bg-slate-700'];

const hashIndex = (s: string, n: number) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % n;
};

const initials = (s: string) =>
  s.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?';
