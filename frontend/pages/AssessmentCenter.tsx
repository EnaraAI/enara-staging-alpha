
import React, { useEffect, useState } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  Trash2, 
  Edit, 
  Sparkles, 
  Clock, 
  BookOpen, 
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  Users,
  X,
  Copy,
  Globe,
  ExternalLink,
  Upload,
  FileText
} from 'lucide-react';
import { Assessment, Question, AssessmentRecommendation, Student, Rubric, Batch, Curriculum } from '../types';
import { generateAssessment, getAssessmentRecommendations, generateRubric } from '../services/geminiService';
import {
  fetchCurriculums,
  fetchBatches,
  fetchStudents,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  fetchAssessmentAttempts,
  AssessmentAttemptsReport,
} from '../services/apiService';
import { toast } from '../services/toastService';

const errorMessage = (err: unknown) => (err instanceof Error && err.message ? err.message : 'Unexpected error');
const todayPlus = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

// Signals the AI uses to personalise an assessment for a batch.
function batchLearningSignals(batchStudents: Student[]) {
  return {
    mistakes: batchStudents.flatMap(s => [
      ...(s.pastResults?.flatMap(r => r.answers.filter(a => !a.isCorrect).map(a => a.questionText)) || []),
      ...(s.adaptiveProfile?.weaknesses || []),
    ]),
    chatLogs: batchStudents.flatMap(s => s.chatLogs?.map(l => l.text) || []),
  };
}

interface AssessmentCenterProps {
  assessments: Assessment[];
  setAssessments: React.Dispatch<React.SetStateAction<Assessment[]>>;
  isEnaraAdmin?: boolean;
}

export const AssessmentCenter: React.FC<AssessmentCenterProps> = ({ assessments, setAssessments, isEnaraAdmin }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('All Subjects');
  const [difficultyFilter, setDifficultyFilter] = useState('All Difficulties');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [academicYearFilter, setAcademicYearFilter] = useState('All Years');
  const [batchFilter, setBatchFilter] = useState('All Batches');
  const [creationMode, setCreationMode] = useState<'ai' | 'manual' | 'upload' | 'rubric'>('ai');
  
  // AI Generation Form State
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [numQuestions, setNumQuestions] = useState(5);
  const [objectives, setObjectives] = useState('');
  const [selectedCurriculumId, setSelectedCurriculumId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [isPersonalized, setIsPersonalized] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [dueDate, setDueDate] = useState(todayPlus(7));
  const [instructions, setInstructions] = useState('');
  const [recommendation, setRecommendation] = useState<AssessmentRecommendation | null>(null);
  const [isRecommending, setIsRecommending] = useState(false);
  const [previewAssessment, setPreviewAssessment] = useState<Assessment | null>(null);
  const [previewRubric, setPreviewRubric] = useState<Rubric | null>(null);
  const [isGeneratingRubric, setIsGeneratingRubric] = useState(false);
  const [rubricTotalPoints, setRubricTotalPoints] = useState(100);
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);
  const [resultsAssessment, setResultsAssessment] = useState<Assessment | null>(null);
  const [selectedStudentSubmission, setSelectedStudentSubmission] = useState<{student: Student, result: any} | null>(null);
  const [attemptsReport, setAttemptsReport] = useState<AssessmentAttemptsReport | null>(null);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);
  const [gradingState, setGradingState] = useState<{[key: string]: {score: number, feedback: string}}>({});
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [selectedLink, setSelectedLink] = useState('');
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  // Manual Creation State
  const [manualQuestions, setManualQuestions] = useState<Partial<Question & { modelAnswerMode: 'text' | 'upload', modelAnswerFile?: string }>[]>([{
    type: 'multiple-choice',
    text: '',
    options: ['', '', '', ''],
    correctAnswer: 0,
    explanation: '',
    modelAnswer: '',
    modelAnswerMode: 'text'
  }]);

  // Upload State
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [students, setStudents] = useState<Student[]>([]);

  // Curriculums, batches and students used by the pickers and the results view.
  // Submissions for the assessment whose results are open.
  useEffect(() => {
    if (!resultsAssessment) return;
    let cancelled = false;
    setAttemptsReport(null);
    setAttemptsError(null);
    fetchAssessmentAttempts(resultsAssessment.id)
      .then(report => { if (!cancelled) setAttemptsReport(report); })
      .catch((err: any) => {
        if (cancelled) return;
        setAttemptsError(err.message || 'Could not load submissions.');
        toast.error('Could not load submissions', err.message);
      });
    return () => { cancelled = true; };
  }, [resultsAssessment?.id]);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchCurriculums(), fetchBatches(), fetchStudents()]).then(([c, b, s]) => {
      if (cancelled) return;
      if (c.status === 'fulfilled') setCurriculums(c.value as Curriculum[]);
      if (b.status === 'fulfilled') setBatches(b.value as Batch[]);
      if (s.status === 'fulfilled') setStudents(s.value as Student[]);
      const failed = [c, b, s].find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed) toast.error('Could not load curriculums, batches or students', errorMessage(failed.reason));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "absolute";
        textArea.style.left = "-999999px";
        document.body.prepend(textArea);
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setCopySuccess('Link copied to clipboard!');
      setTimeout(() => setCopySuccess(null), 3000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const handleDelete = async (id: string) => {
    const asm = assessments.find(a => a.id === id);
    if (!window.confirm(`Delete "${asm?.title || id}"?`)) return;
    try {
      await deleteAssessment(id);
      setAssessments(prev => prev.filter(a => a.id !== id));
      toast.success('Assessment deleted', asm?.title || id);
    } catch (err) {
      toast.error('Could not delete assessment', errorMessage(err));
    }
  };

  const handleGetRecommendations = async () => {
    if (!selectedBatchId) {
      toast.warning('Select a batch', 'Please select a batch first to get recommendations.');
      return;
    }
    
    setIsRecommending(true);
    try {
      const data = batchLearningSignals(students.filter(s => s.batchId === selectedBatchId));
      
      const rec = await getAssessmentRecommendations(data);
      setRecommendation(rec as AssessmentRecommendation);
    } catch (error) {
      console.error("Failed to get recommendations:", error);
      toast.error('Could not get recommendations', errorMessage(error));
    } finally {
      setIsRecommending(false);
    }
  };

  const applyRecommendation = () => {
    if (recommendation) {
      setTopic(recommendation.suggestedTopic);
      setDifficulty(recommendation.suggestedDifficulty);
      setObjectives(`Focus areas: ${recommendation.focusAreas.join(', ')}. Question types: ${recommendation.suggestedQuestionTypes.join(', ')}.`);
      setIsPersonalized(true);
    }
  };

  const handleEdit = (asm: Assessment) => {
    setEditingAssessment(asm);
    setCreationMode('ai');
    setTopic(asm.title);
    if (/^\d{4}-\d{2}-\d{2}/.test(asm.dueDate || '')) setDueDate(asm.dueDate.slice(0, 10));
    setDifficulty(asm.difficulty);
    setInstructions(asm.instructions || '');
    setSelectedCurriculumId(asm.curriculumId || '');
    setSelectedBatchId(asm.batchId || '');
    setIsModalOpen(true);
  };

  const handleUpdateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAssessment) return;

    setIsSaving(true);
    try {
      const updated = (await updateAssessment(editingAssessment.id, {
        title: topic,
        difficulty,
        instructions,
        dueDate,
        curriculumId: selectedCurriculumId,
        batchId: selectedBatchId,
      })) as Assessment;
      setAssessments(prev => prev.map(a => (a.id === updated.id ? updated : a)));
      toast.success('Assessment updated', updated.title);
    } catch (err) {
      toast.error('Could not update assessment', errorMessage(err));
      return;
    } finally {
      setIsSaving(false);
    }
    
    setIsModalOpen(false);
    setEditingAssessment(null);
    setTopic('');
    setInstructions('');
    setSelectedCurriculumId('');
    setSelectedBatchId('');
  };

  const handleCreateWithAI = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    
    try {
      let personalization = undefined;
      
      if (isPersonalized && selectedBatchId) {
        // Gather data from all students in the selected batch
        personalization = batchLearningSignals(students.filter(s => s.batchId === selectedBatchId));
      }

      const result = await generateAssessment({
        topic,
        difficulty,
        numQuestions,
        objectives,
        personalization
      });

      const batch = batches.find(b => b.id === selectedBatchId);
      const newAssessment: Assessment = {
        id: `ASM-${Date.now()}`,
        title: isPersonalized && batch ? `Batch Adaptive: ${topic} (${batch.name})` : topic,
        subject: curriculums.find(c => c.id === selectedCurriculumId)?.name || 'General',
        duration: Math.max(1, (numQuestions || 1) * 2), // 2 mins per question
        status: 'upcoming',
        dueDate,
        difficulty,
        curriculumId: selectedCurriculumId,
        batchId: selectedBatchId,
        instructions: instructions || result.suggestedInstructions,
        questions: (result.questions || []).map((q: any, i: number) => {
          if (!q) return null;
          return {
            id: `Q-${Date.now()}-${i}`,
            type: q.type || 'multiple-choice',
            text: q.question || '',
            options: q.options || [],
            correctAnswer: q.type === 'short-answer' ? (q.correctAnswer || '') : parseInt(q.correctAnswer || '0'),
            explanation: q.explanation || ''
          };
        }).filter(Boolean) as Question[]
      };

      setPreviewAssessment(newAssessment);
    } catch (error) {
      console.error("Failed to generate assessment:", error);
      toast.error('Could not generate assessment', errorMessage(error));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateRubric = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGeneratingRubric(true);
    try {
      const result = await generateRubric({
        topic,
        objectives,
        totalPoints: rubricTotalPoints
      });
      
      const newRubric: Rubric = {
        id: `RUB-${Date.now()}`,
        ...result,
        criteria: result.criteria.map((c, i) => ({ id: `CRIT-${i + 1}`, ...c })),
        totalPoints: rubricTotalPoints
      };
      
      setPreviewRubric(newRubric);
    } catch (error) {
      console.error("Failed to generate rubric:", error);
      toast.error('Could not generate rubric', errorMessage(error));
    } finally {
      setIsGeneratingRubric(false);
    }
  };

  const handleDeploy = async () => {
    if (previewAssessment) {
      // The backend assigns the assessment id.
      const { id: _draftId, ...draft } = previewAssessment;
      let created: Assessment;
      setIsSaving(true);
      try {
        created = (await createAssessment({
          ...draft,
          curriculumId: draft.curriculumId || undefined,
          batchId: draft.batchId || undefined,
          studentId: draft.studentId || undefined,
        })) as Assessment;
      } catch (err) {
        toast.error('Could not save assessment', errorMessage(err));
        return;
      } finally {
        setIsSaving(false);
      }
      const deployedId = created.id;
      setAssessments(prev => [created, ...prev]);
      setPreviewAssessment(null);
      setIsModalOpen(false);
      
      // Show share link modal for the newly created assessment
      setSelectedLink(`${window.location.origin}/?assessment=${deployedId}`);
      setShowLinkModal(true);

      // Reset form
      setTopic('');
      setObjectives('');
      setInstructions('');
      setSelectedCurriculumId('');
      setSelectedBatchId('');
      setIsPersonalized(false);
      setSelectedStudentId('');
      setRecommendation(null);
      setManualQuestions([{
        type: 'multiple-choice',
        text: '',
        options: ['', '', '', ''],
        correctAnswer: 0,
        explanation: '',
        modelAnswer: '',
        modelAnswerMode: 'text'
      }]);
      setUploadedFile(null);
    }
  };

  const handleAddManualQuestion = () => {
    setManualQuestions([...manualQuestions, {
      type: 'multiple-choice',
      text: '',
      options: ['', '', '', ''],
      correctAnswer: 0,
      explanation: '',
      modelAnswer: '',
      modelAnswerMode: 'text'
    }]);
  };

  const handleManualQuestionChange = (index: number, field: keyof Question | 'modelAnswerMode' | 'modelAnswerFile', value: any) => {
    const newQuestions = [...manualQuestions];
    newQuestions[index] = { ...newQuestions[index], [field]: value };
    setManualQuestions(newQuestions);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newAssessment: Assessment = {
      id: `ASM-${Date.now()}`,
      title: topic,
      subject: curriculums.find(c => c.id === selectedCurriculumId)?.name || 'General',
      duration: manualQuestions.length * 2,
      status: 'upcoming',
      dueDate,
      difficulty,
      curriculumId: selectedCurriculumId,
      batchId: selectedBatchId,
      instructions,
      questions: manualQuestions.map((q, i) => ({
        id: `Q-${Date.now()}-${i}`,
        type: q.type || 'multiple-choice',
        text: q.text || '',
        options: q.options,
        correctAnswer: q.correctAnswer || 0,
        explanation: q.explanation || '',
        modelAnswer: q.modelAnswerMode === 'upload' ? q.modelAnswerFile : q.modelAnswer
      })) as Question[]
    };
    setPreviewAssessment(newAssessment);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      // There is no backend endpoint that parses an assessment document yet.
      toast.warning(
        'Document parsing is not available yet',
        'Use the template generator or manual entry to create this assessment.'
      );
    }
  };

  const handleSaveGrades = () => {
    if (!selectedStudentSubmission || !selectedStudentSubmission.result) return;

    const updatedAnswers = selectedStudentSubmission.result.answers.map((answer: any, idx: number) => {
      const grading = gradingState[idx];
      if (grading) {
        return {
          ...answer,
          manualScore: grading.score,
          manualFeedback: grading.feedback,
          isManuallyGraded: true,
          isCorrect: grading.score > 0 // Simple logic for correctness
        };
      }
      return answer;
    });

    // Calculate new total score if some were manually graded
    const totalPossible = updatedAnswers.length * 100;
    const totalEarned = updatedAnswers.reduce((acc: number, curr: any) => acc + (curr.manualScore !== undefined ? curr.manualScore : (curr.isCorrect ? 100 : 0)), 0);
    const newScore = Math.round((totalEarned / totalPossible) * 100);

    const updatedResult = {
      ...selectedStudentSubmission.result,
      answers: updatedAnswers,
      score: newScore,
      isManuallyGraded: true,
      manualTotalScore: newScore
    };

    // There is no backend endpoint for manual grades yet; only the open review reflects them.
    setSelectedStudentSubmission({
      ...selectedStudentSubmission,
      result: updatedResult
    });

    toast.warning('Grades not saved', 'Saving manual grades to the server is not supported yet.');
    setGradingState({});
  };

  const filteredAssessments = assessments.filter(a => {
    const matchesSearch = a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         a.subject.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSubject = subjectFilter === 'All Subjects' || a.subject === subjectFilter;
    const matchesDifficulty = difficultyFilter === 'All Difficulties' || a.difficulty === difficultyFilter;
    const matchesStatus = statusFilter === 'All Status' || a.status === statusFilter.toLowerCase();
    const matchesBatch = batchFilter === 'All Batches' || a.batchId === batchFilter;
    
    return matchesSearch && matchesSubject && matchesDifficulty && matchesStatus && matchesBatch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex items-start gap-3">
          <button 
            onClick={() => window.history.back()} 
            className="mt-1 p-2 text-slate-600 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200 rounded-md transition-colors"
            title="Go Back"
            aria-label="Go back"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-teal-700">School admin</p>
            <h1 className="text-3xl font-extrabold text-slate-900 mt-1">Assessment Center</h1>
            <p className="text-slate-600 mt-1">Manage institutional evaluations. Generated questions are generic templates until AI generation ships: review every question before publishing.</p>
          </div>
        </div>
        <button 
          onClick={() => {
            setEditingAssessment(null);
            setTopic('');
            setInstructions('');
            setSelectedCurriculumId('');
            setSelectedBatchId('');
            setIsModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 px-5 h-11 rounded-md bg-teal-600 hover:bg-teal-700 text-white font-bold transition-all w-full md:w-auto"
        >
          <Sparkles size={18} /> Create with AI
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200">
          <p className="text-sm text-slate-600 mb-1">Total Assessments</p>
          <h3 className="text-3xl font-extrabold text-slate-900">{assessments.length}</h3>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200">
          <p className="text-sm text-slate-600 mb-1">Active</p>
          <h3 className="text-3xl font-extrabold text-slate-900">{assessments.filter(a => a.status === 'active').length}</h3>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 sm:col-span-2 lg:col-span-1">
          <p className="text-sm text-slate-600 mb-1">Upcoming</p>
          <h3 className="text-3xl font-extrabold text-slate-900">{assessments.filter(a => a.status === 'upcoming').length}</h3>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search by title or subject..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 h-11 rounded-md border border-slate-300 focus:border-teal-500 outline-none transition-all text-sm"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <select 
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="px-4 h-11 rounded-md border border-slate-300 text-slate-600 font-semibold outline-none focus:border-teal-500 bg-white text-sm"
          >
            <option>All Subjects</option>
            {Array.from(new Set(assessments.map(a => a.subject))).map(subject => (
              <option key={subject} value={subject}>{subject}</option>
            ))}
          </select>
          <select 
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value)}
            className="px-4 h-11 rounded-md border border-slate-300 text-slate-600 font-semibold outline-none focus:border-teal-500 bg-white text-sm"
          >
            <option>All Difficulties</option>
            <option>Easy</option>
            <option>Medium</option>
            <option>Hard</option>
          </select>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`${isEnaraAdmin ? '' : 'col-span-2 sm:col-span-1'} px-4 h-11 rounded-md border border-slate-300 text-slate-600 font-semibold outline-none focus:border-teal-500 bg-white text-sm`}
          >
            <option>All Status</option>
            <option>Upcoming</option>
            <option>Active</option>
            <option>Completed</option>
          </select>
          <select 
            value={academicYearFilter}
            onChange={(e) => setAcademicYearFilter(e.target.value)}
            className="px-4 h-11 rounded-md border border-slate-300 text-slate-600 font-semibold outline-none focus:border-teal-500 bg-white text-sm"
          >
            <option>All Years</option>
            <option>2023-2024</option>
            <option>2024-2025</option>
          </select>
          <select 
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            className="px-4 h-11 rounded-md border border-slate-300 text-slate-600 font-semibold outline-none focus:border-teal-500 bg-white text-sm"
          >
            <option>All Batches</option>
            {batches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Assessment Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {filteredAssessments.map((asm) => {
          const curriculum = curriculums.find(c => c.id === asm.curriculumId);
          const batch = batches.find(b => b.id === asm.batchId);
          
          return (
            <div key={asm.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden group transition-all flex flex-col">
              <div className="p-6 flex-1">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-1 rounded-lg bg-teal-50 text-teal-700 text-xs font-bold">
                      {asm.subject}
                    </span>
                    <span className={`px-2 py-1 rounded-lg text-xs font-bold ${
                      asm.difficulty === 'Hard' ? 'bg-red-50 text-red-600' : 
                      asm.difficulty === 'Medium' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
                    }`}>
                      {asm.difficulty}
                    </span>
                  </div>
                  <div className="relative group/menu">
                    <button className="p-1 text-slate-500 hover:text-slate-600">
                      <MoreVertical size={18} />
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl shadow-xl border border-slate-200 opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all z-10">
                      <button 
                        onClick={() => handleEdit(asm)}
                        className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                      >
                        <Edit size={14} /> Edit
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedLink(`${window.location.origin}/?assessment=${asm.id}`);
                          setShowLinkModal(true);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                      >
                        <Globe size={14} /> Share Link
                      </button>
                      <button 
                        onClick={() => handleDelete(asm.id)}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </div>
                </div>

                <h3 className="text-lg font-bold text-slate-900 mb-2">{asm.title}</h3>
                
                {asm.instructions && (
                  <p className="text-xs text-slate-500 mb-4 line-clamp-2">
                    "{asm.instructions}"
                  </p>
                )}

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-4 text-slate-500 text-xs">
                    <span className="flex items-center gap-1"><Clock size={14} /> {asm.duration} mins</span>
                    <span className="flex items-center gap-1"><BookOpen size={14} /> {asm.questions.length} Questions</span>
                  </div>
                  
                  {curriculum && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-bold text-slate-500 tracking-tighter">Curriculum:</span>
                      <span className="truncate">{curriculum.name}</span>
                    </div>
                  )}
                  
                  {batch && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-bold text-slate-500 tracking-tighter">Assigned To:</span>
                      <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-semibold">{batch.name}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-xs font-bold text-slate-500">
                    <span>Status</span>
                    <span>{asm.status}</span>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-500 font-medium">Due: {asm.dueDate}</span>
                  <button 
                    onClick={() => {
                      setSelectedLink(`${window.location.origin}/?assessment=${asm.id}`);
                      setShowLinkModal(true);
                    }}
                    className="text-indigo-600 hover:text-indigo-700 font-bold text-xs flex items-center gap-1"
                    title="Generate Shareable Link"
                  >
                    <Globe size={14} /> Share
                  </button>
                </div>
                <button 
                  onClick={() => setResultsAssessment(asm)}
                  className="text-teal-700 font-bold text-xs flex items-center gap-1 hover:gap-2 transition-all"
                >
                  View Results <ChevronRight size={14} />
                </button>
              </div>
            </div>
          );
        })}
        
        {/* Empty State */}
        {filteredAssessments.length === 0 && (
          <div className="col-span-full py-20 text-center">
            <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">No assessments found</h3>
            <p className="text-slate-500">Try adjusting your search or filters.</p>
          </div>
        )}
      </div>

      {/* Link Preview Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl animate-slide-in overflow-hidden">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Globe size={20} />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">Assessment Access Link</h2>
                </div>
                <button 
                  onClick={() => setShowLinkModal(false)} 
                  className="p-2 text-slate-500 hover:bg-slate-50 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <p className="text-slate-500 text-sm mb-6">
                Share this unique link with your students. They will be taken directly to the assessment interface after logging in.
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-8 group relative">
                <div className="flex items-center justify-between gap-4">
                  <code className="text-sm text-indigo-600 font-mono break-all select-all">
                    {selectedLink}
                  </code>
                  <button 
                    onClick={() => copyToClipboard(selectedLink)}
                    className="shrink-0 p-3 bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 rounded-md transition-all"
                    title="Copy to Clipboard"
                  >
                    <Copy size={20} />
                  </button>
                </div>
                {copySuccess && (
                  <p className="absolute -bottom-6 left-0 text-xs font-bold text-emerald-600 animate-slide-in">
                    {copySuccess}
                  </p>
                )}
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setShowLinkModal(false)}
                  className="flex-1 px-6 py-3 border border-slate-200 rounded-md font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Close
                </button>
                <button 
                  onClick={() => window.open(selectedLink, '_blank')}
                  className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-md font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                >
                  <ExternalLink size={18} />
                  Open Assessment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Creation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => !isGenerating && setIsModalOpen(false)}></div>
          <div className="relative bg-white rounded-none sm:rounded-xl shadow-xl w-full max-w-xl overflow-hidden animate-slide-in flex flex-col h-full sm:h-auto sm:max-h-[90vh]">
            <div className="p-6 sm:p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                  <Plus size={20} />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900">Create New Assessment</h2>
                  <p className="text-xs text-slate-500">Choose your preferred creation method.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                disabled={isGenerating || isSaving}
                className="p-2 text-slate-500 hover:text-slate-600 disabled:opacity-30"
              >
                <X size={20} />
              </button>
            </div>

            {/* Creation Tabs */}
            <div className="flex border-b border-slate-100 px-6 sm:px-8 bg-slate-50/50">
              <button 
                onClick={() => setCreationMode('ai')}
                className={`px-4 py-3 text-xs font-bold   transition-all border-b-2 ${creationMode === 'ai' ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-500 hover:text-slate-600'}`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles size={14} /> Template generator
                </div>
              </button>
              <button 
                onClick={() => setCreationMode('manual')}
                className={`px-4 py-3 text-xs font-bold   transition-all border-b-2 ${creationMode === 'manual' ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-500 hover:text-slate-600'}`}
              >
                <div className="flex items-center gap-2">
                  <Edit size={14} /> Manual Entry
                </div>
              </button>
              <button 
                onClick={() => setCreationMode('upload')}
                className={`px-4 py-3 text-xs font-bold   transition-all border-b-2 ${creationMode === 'upload' ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-500 hover:text-slate-600'}`}
              >
                <div className="flex items-center gap-2">
                  <Plus size={14} /> Upload File
                </div>
              </button>
              <button 
                onClick={() => setCreationMode('rubric')}
                className={`px-4 py-3 text-xs font-bold   transition-all border-b-2 ${creationMode === 'rubric' ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-500 hover:text-slate-600'}`}
              >
                <div className="flex items-center gap-2">
                  <FileText size={14} /> Rubric Engine
                </div>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {creationMode === 'ai' && (
                <form onSubmit={editingAssessment ? handleUpdateAssessment : handleCreateWithAI} className="p-6 sm:p-6 space-y-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Assessment Topic</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g., Advanced Trigonometry, Civil War History..."
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      className="w-full px-4 h-11 rounded-md border border-slate-300 focus:border-teal-500 outline-none transition-all text-sm"
                    />
                  </div>

                  {!editingAssessment && (
                    <div className="p-4 bg-slate-50 rounded-xl space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users size={16} className="text-slate-400" />
                          <span className="text-sm font-bold text-slate-700">Personalized Assessment</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsPersonalized(!isPersonalized)}
                          className={`w-12 h-6 rounded-full transition-all relative ${isPersonalized ? 'bg-teal-600' : 'bg-slate-300'}`}
                        >
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isPersonalized ? 'left-7' : 'left-1'}`} />
                        </button>
                      </div>
                      
                      {isPersonalized && (
                        <div className="animate-slide-in">
                          <p className="text-xs text-teal-600 mt-2 flex items-center gap-1 bg-teal-50 p-2 rounded-lg border border-teal-100">
                            <Sparkles size={10} /> AI will analyze collective mistakes and tutor logs from all students in the selected batch to create an adaptive assessment.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {!editingAssessment && (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Smart Recommendations</label>
                        <button 
                          type="button"
                          onClick={handleGetRecommendations}
                          disabled={isRecommending || !selectedBatchId}
                          className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 disabled:opacity-30"
                        >
                          {isRecommending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                          Get suggested settings
                        </button>
                      </div>

                      {recommendation && (
                        <div className="p-4 bg-teal-50/50 border border-teal-100 rounded-xl space-y-3 animate-slide-in">
                          <div className="flex justify-between items-start">
                            <h4 className="text-sm font-bold text-teal-900">Suggested settings (template, not AI)</h4>
                            <button 
                              type="button"
                              onClick={applyRecommendation}
                              className="text-xs font-bold bg-teal-600 text-white px-2 py-1 rounded-lg hover:bg-teal-700 transition-all"
                            >
                              Apply
                            </button>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">"{recommendation.reasoning}"</p>
                          <div className="flex flex-wrap gap-2">
                            <span className="px-2 py-1 bg-white border border-teal-100 rounded-lg text-xs font-bold text-teal-700">
                              Topic: {recommendation.suggestedTopic}
                            </span>
                            <span className="px-2 py-1 bg-white border border-teal-100 rounded-lg text-xs font-bold text-teal-700">
                              Difficulty: {recommendation.suggestedDifficulty}
                            </span>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-slate-500">Focus Areas</p>
                            <div className="flex flex-wrap gap-1">
                              {recommendation.focusAreas.map((area, i) => (
                                <span key={i} className="text-xs text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{area}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Curriculum</label>
                      <select 
                        required
                        value={selectedCurriculumId}
                        onChange={(e) => setSelectedCurriculumId(e.target.value)}
                        className="w-full px-4 h-11 rounded-md border border-slate-300 focus:border-teal-500 outline-none transition-all bg-white text-sm"
                      >
                        <option value="">Select Curriculum</option>
                        {curriculums.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Assign to Batch</label>
                      <select 
                        required
                        value={selectedBatchId}
                        onChange={(e) => setSelectedBatchId(e.target.value)}
                        className="w-full px-4 h-11 rounded-md border border-slate-300 focus:border-teal-500 outline-none transition-all bg-white text-sm"
                      >
                        <option value="">Select Batch</option>
                        {batches.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Difficulty</label>
                      <select 
                        value={difficulty}
                        onChange={(e) => setDifficulty(e.target.value as any)}
                        className="w-full px-4 h-11 rounded-md border border-slate-300 focus:border-teal-500 outline-none transition-all bg-white text-sm"
                      >
                        <option value="Easy">Easy</option>
                        <option value="Medium">Medium</option>
                        <option value="Hard">Hard</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Questions</label>
                      <input 
                        type="number" 
                        min="1" 
                        max="20"
                        value={numQuestions}
                        onChange={(e) => setNumQuestions(parseInt(e.target.value))}
                        className="w-full px-4 h-11 rounded-md border border-slate-300 focus:border-teal-500 outline-none transition-all text-sm"
                      />
                    </div>
                    <div className="space-y-2 col-span-2 sm:col-span-1">
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Due Date</label>
                      <input 
                        type="date" 
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="w-full px-4 h-11 rounded-md border border-slate-300 focus:border-teal-500 outline-none transition-all text-sm"
                      />
                    </div>
                  </div>

                  {!editingAssessment && (
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Learning Objectives (Optional)</label>
                      <textarea 
                        placeholder="e.g., Focus on sine and cosine rules, include one word problem..."
                        value={objectives}
                        onChange={(e) => setObjectives(e.target.value)}
                        className="w-full px-4 py-3 rounded-md border border-slate-300 focus:border-teal-500 outline-none transition-all h-24 resize-none text-sm"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Instructions for Students (Optional)</label>
                    <textarea 
                      placeholder="e.g., Please ensure you have a calculator ready. You have 30 minutes to complete this test."
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      className="w-full px-4 py-3 rounded-md border border-slate-300 focus:border-teal-500 outline-none transition-all h-24 resize-none text-sm"
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={isGenerating || isSaving}
                    className="w-full py-4 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100 text-sm sm:text-base"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 size={20} className="animate-spin" /> Generating...
                      </>
                    ) : (
                      <>
                        {editingAssessment ? <CheckCircle2 size={20} /> : <Sparkles size={20} />}
                        {editingAssessment ? 'Update Assessment' : 'Preview Assessment'}
                      </>
                    )}
                  </button>
                </form>
              )}

              {creationMode === 'manual' && (
                <form onSubmit={handleManualSubmit} className="p-6 sm:p-6 space-y-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Assessment Title</label>
                    <input 
                      type="text" 
                      required
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="e.g., Mid-term Exam"
                      className="w-full px-4 h-11 rounded-md border border-slate-300 focus:border-teal-500 outline-none transition-all text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Curriculum</label>
                      <select 
                        required
                        value={selectedCurriculumId}
                        onChange={(e) => setSelectedCurriculumId(e.target.value)}
                        className="w-full px-4 h-11 rounded-md border border-slate-300 focus:border-teal-500 outline-none transition-all bg-white text-sm"
                      >
                        <option value="">Select Curriculum</option>
                        {curriculums.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Assign to Batch</label>
                      <select 
                        required
                        value={selectedBatchId}
                        onChange={(e) => setSelectedBatchId(e.target.value)}
                        className="w-full px-4 h-11 rounded-md border border-slate-300 focus:border-teal-500 outline-none transition-all bg-white text-sm"
                      >
                        <option value="">Select Batch</option>
                        {batches.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-bold text-slate-900">Questions</h3>
                      <button 
                        type="button"
                        onClick={handleAddManualQuestion}
                        className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1"
                      >
                        <Plus size={14} /> Add Question
                      </button>
                    </div>

                    {manualQuestions.map((q, idx) => (
                      <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-500">Question {idx + 1}</span>
                          <select 
                            value={q.type}
                            onChange={(e) => handleManualQuestionChange(idx, 'type', e.target.value)}
                            className="text-xs font-medium bg-white border border-slate-300 rounded-md px-2 py-1"
                          >
                            <option value="multiple-choice">Multiple Choice</option>
                            <option value="short-answer">Short Answer</option>
                          </select>
                        </div>
                        <input 
                          type="text"
                          required
                          value={q.text}
                          onChange={(e) => handleManualQuestionChange(idx, 'text', e.target.value)}
                          placeholder="Enter question text..."
                          className="w-full px-3 h-11 rounded-md border border-slate-300 text-sm"
                        />
                        {q.type === 'multiple-choice' && q.options && (
                          <div className="grid grid-cols-2 gap-2">
                            {q.options.map((opt, oIdx) => (
                              <div key={oIdx} className="flex items-center gap-2">
                                <input 
                                  type="radio"
                                  name={`correct-${idx}`}
                                  checked={q.correctAnswer === oIdx}
                                  onChange={() => handleManualQuestionChange(idx, 'correctAnswer', oIdx)}
                                />
                                <input 
                                  type="text"
                                  required
                                  value={opt}
                                  onChange={(e) => {
                                    const newOpts = [...q.options!];
                                    newOpts[oIdx] = e.target.value;
                                    handleManualQuestionChange(idx, 'options', newOpts);
                                  }}
                                  placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                                  className="w-full px-2 py-1 rounded border border-slate-300 text-xs"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                        {q.type === 'short-answer' && (
                          <input 
                            type="text"
                            required
                            value={q.correctAnswer as string}
                            onChange={(e) => handleManualQuestionChange(idx, 'correctAnswer', e.target.value)}
                            placeholder="Correct Answer..."
                            className="w-full px-3 h-11 rounded-md border border-slate-300 text-sm"
                          />
                        )}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Model Answer</label>
                            <div className="flex bg-slate-100 p-0.5 rounded-lg">
                              <button 
                                type="button"
                                onClick={() => handleManualQuestionChange(idx, 'modelAnswerMode', 'text')}
                                className={`px-2 py-1 text-xs font-bold rounded-md transition-all ${q.modelAnswerMode === 'text' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500'}`}
                              >
                                Text
                              </button>
                              <button 
                                type="button"
                                onClick={() => handleManualQuestionChange(idx, 'modelAnswerMode', 'upload')}
                                className={`px-2 py-1 text-xs font-bold rounded-md transition-all ${q.modelAnswerMode === 'upload' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500'}`}
                              >
                                Upload
                              </button>
                            </div>
                          </div>
                          
                          {q.modelAnswerMode === 'text' ? (
                            <textarea 
                              value={q.modelAnswer}
                              onChange={(e) => handleManualQuestionChange(idx, 'modelAnswer', e.target.value)}
                              placeholder="Enter the model answer here..."
                              className="w-full px-3 py-2 rounded-md border border-slate-300 text-xs h-20 resize-none"
                            />
                          ) : (
                            <div className="relative border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-teal-500 hover:bg-teal-50/10 transition-all cursor-pointer">
                              <input 
                                type="file"
                                accept=".pdf,.docx,.png,.jpg"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleManualQuestionChange(idx, 'modelAnswerFile', file.name);
                                  }
                                }}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                              />
                              {q.modelAnswerFile ? (
                                <div className="flex items-center justify-center gap-2 text-teal-600 font-bold text-xs">
                                  <CheckCircle2 size={14} /> {q.modelAnswerFile}
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-1">
                                  <Upload size={16} className="text-slate-400" />
                                  <span className="text-xs text-slate-500 font-medium">Click to upload model answer</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <textarea 
                          value={q.explanation}
                          onChange={(e) => handleManualQuestionChange(idx, 'explanation', e.target.value)}
                          placeholder="AI Explanation / Feedback (Optional)..."
                          className="w-full px-3 py-2 rounded-md border border-slate-300 text-xs h-16 resize-none"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Instructions for Students (Optional)</label>
                    <textarea 
                      placeholder="e.g., Please ensure you have a calculator ready. You have 30 minutes to complete this test."
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      className="w-full px-4 py-3 rounded-md border border-slate-300 focus:border-teal-500 outline-none transition-all h-24 resize-none text-sm"
                    />
                  </div>

                  <button 
                    type="submit"
                    className="w-full py-4 bg-teal-600 text-white rounded-md font-bold hover:bg-teal-700 transition-all"
                  >
                    Preview Assessment
                  </button>
                </form>
              )}

              {creationMode === 'upload' && (
                <div className="p-6 sm:p-6 space-y-8">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Curriculum & Batch</label>
                    <div className="grid grid-cols-2 gap-4">
                      <select 
                        required
                        value={selectedCurriculumId}
                        onChange={(e) => setSelectedCurriculumId(e.target.value)}
                        className="w-full px-4 h-11 rounded-md border border-slate-300 focus:border-teal-500 outline-none transition-all bg-white text-sm"
                      >
                        <option value="">Select Curriculum</option>
                        {curriculums.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <select 
                        required
                        value={selectedBatchId}
                        onChange={(e) => setSelectedBatchId(e.target.value)}
                        className="w-full px-4 h-11 rounded-md border border-slate-300 focus:border-teal-500 outline-none transition-all bg-white text-sm"
                      >
                        <option value="">Select Batch</option>
                        {batches.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Instructions for Students (Optional)</label>
                    <textarea 
                      placeholder="e.g., Please ensure you have a calculator ready. You have 30 minutes to complete this test."
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      className="w-full px-4 py-3 rounded-md border border-slate-300 focus:border-teal-500 outline-none transition-all h-24 resize-none text-sm"
                    />
                  </div>

                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center space-y-4 hover:border-teal-500 hover:bg-teal-50/10 transition-all cursor-pointer relative">
                    <input 
                      type="file" 
                      accept=".pdf,.docx"
                      onChange={handleFileUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div className="w-16 h-16 bg-slate-50 text-slate-500 rounded-xl flex items-center justify-center mx-auto mb-4">
                      <Plus size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">Upload Assessment Document</h3>
                    <p className="text-sm text-slate-500">Support for PDF and DOCX files. AI will parse questions and model answers.</p>
                    {uploadedFile && (
                      <div className="mt-4 p-3 bg-teal-50 text-teal-700 rounded-xl font-bold text-sm inline-flex items-center gap-2">
                        <CheckCircle2 size={16} /> {uploadedFile.name}
                      </div>
                    )}
                  </div>

                </div>
              )}

              {creationMode === 'rubric' && (
                <form onSubmit={handleGenerateRubric} className="p-6 sm:p-6 space-y-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Assessment Topic / Context</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g., Argumentative Essay on Climate Change..."
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      className="w-full px-4 h-11 rounded-md border border-slate-300 focus:border-teal-500 outline-none transition-all text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Learning Objectives / Criteria Focus</label>
                    <textarea 
                      placeholder="e.g., Focus on structure, evidence quality, and grammar..."
                      value={objectives}
                      onChange={(e) => setObjectives(e.target.value)}
                      className="w-full px-4 py-3 rounded-md border border-slate-300 focus:border-teal-500 outline-none transition-all h-24 resize-none text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Total Points</label>
                    <input 
                      type="number" 
                      min="1"
                      max="1000"
                      value={rubricTotalPoints}
                      onChange={(e) => setRubricTotalPoints(parseInt(e.target.value))}
                      className="w-full px-4 h-11 rounded-md border border-slate-300 focus:border-teal-500 outline-none transition-all text-sm"
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={isGeneratingRubric}
                    className="w-full py-4 bg-indigo-600 text-white rounded-md font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm sm:text-base"
                  >
                    {isGeneratingRubric ? (
                      <>
                        <Loader2 size={20} className="animate-spin" /> Generating Rubric...
                      </>
                    ) : (
                      <>
                        <Sparkles size={20} /> Generate template rubric
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewAssessment && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => !isGenerating && setPreviewAssessment(null)}></div>
          <div className="relative bg-white rounded-none sm:rounded-xl shadow-xl w-full max-w-3xl overflow-hidden animate-slide-in flex flex-col h-full sm:h-auto sm:max-h-[90vh]">
            <div className="p-6 sm:p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900">Preview Assessment</h2>
                  <p className="text-xs text-slate-500">Review generated questions before deployment.</p>
                </div>
              </div>
              <button 
                onClick={() => setPreviewAssessment(null)}
                className="p-2 text-slate-500 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 sm:p-6 overflow-y-auto flex-1 space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-xl">
                <div>
                  <p className="text-xs font-bold text-slate-500">Title</p>
                  <p className="text-sm font-bold text-slate-900">{previewAssessment.title}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500">Subject</p>
                  <p className="text-sm font-bold text-slate-900">{previewAssessment.subject}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500">Difficulty</p>
                  <p className="text-sm font-bold text-slate-900">{previewAssessment.difficulty}</p>
                </div>
              </div>

              <div className="space-y-6">
                {previewAssessment.questions.map((q, idx) => {
                  if (!q) return null;
                  return (
                    <div key={q.id} className="p-5 sm:p-6 border border-slate-100 rounded-xl space-y-4">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex gap-3">
                          <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0">
                            {idx + 1}
                          </span>
                          <p className="font-bold text-slate-800 text-sm sm:text-base">{q.text}</p>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-xs font-bold shrink-0">
                          {q.type ? q.type.replace('-', ' ') : 'Question'}
                        </span>
                      </div>

                      {q.type !== 'short-answer' && q.options && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-0 sm:pl-9">
                          {q.options.map((opt, oIdx) => (
                            <div 
                              key={oIdx} 
                              className={`p-3 rounded-xl border text-sm ${
                                oIdx === q.correctAnswer 
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-medium' 
                                  : 'bg-white border-slate-100 text-slate-600'
                              }`}
                            >
                              <span className="mr-2 opacity-50">{String.fromCharCode(65 + oIdx)}.</span>
                              {opt}
                            </div>
                          ))}
                        </div>
                      )}

                      {q.type === 'short-answer' && (
                        <div className="pl-0 sm:pl-9">
                          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium">
                            <span className="text-xs text-emerald-600 block mb-1 font-bold">Correct Answer</span>
                            {q.correctAnswer}
                          </div>
                        </div>
                      )}

                      {q.modelAnswer && (
                        <div className="pl-0 sm:pl-9 p-3 bg-teal-50 border border-teal-100 rounded-xl text-xs text-teal-700">
                          <span className="font-bold text-teal-900 mr-1">Model Answer:</span>
                          {q.modelAnswer}
                        </div>
                      )}

                      <div className="pl-0 sm:pl-9 p-3 bg-slate-50 rounded-xl text-xs text-slate-500">
                        <span className="font-bold text-slate-700 not-italic mr-1">Explanation:</span>
                        {q.explanation}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-6 sm:p-6 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-4 shrink-0">
              <button 
                onClick={(e) => {
                  setPreviewAssessment(null);
                  handleCreateWithAI(e as any);
                }}
                disabled={isGenerating}
                className="flex-1 py-4 border border-slate-200 bg-white text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm sm:text-base"
              >
                {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <ChevronLeft size={18} />}
                Back & Regenerate
              </button>
              <button 
                onClick={handleDeploy}
                disabled={isSaving}
                className="disabled:opacity-50 flex-[2] py-4 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-bold transition-all flex items-center justify-center gap-2 text-sm sm:text-base"
              >
                {isSaving ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />} Deploy Assessment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rubric Preview Modal */}
      {previewRubric && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setPreviewRubric(null)}></div>
          <div className="relative bg-white rounded-none sm:rounded-xl shadow-xl w-full max-w-4xl overflow-hidden animate-slide-in flex flex-col h-full sm:h-auto sm:max-h-[90vh]">
            <div className="p-6 sm:p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <FileText size={20} />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900">Preview rubric</h2>
                  <p className="text-xs text-slate-500">A generic template, not written by AI. Edit it before use.</p>
                </div>
              </div>
              <button 
                onClick={() => setPreviewRubric(null)}
                className="p-2 text-slate-500 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 sm:p-6 overflow-y-auto flex-1 space-y-8">
              <div className="p-6 bg-slate-50 rounded-xl">
                <h3 className="text-lg font-bold text-slate-900 mb-2">{previewRubric.title}</h3>
                <p className="text-sm text-slate-600">"{previewRubric.description}"</p>
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Total Weight:</span>
                  <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold">{previewRubric.totalPoints} Points</span>
                </div>
              </div>

              <div className="space-y-8">
                {previewRubric.criteria.map((criterion, idx) => (
                  <div key={idx} className="space-y-4">
                    <div className="flex justify-between items-center bg-slate-100 p-4 rounded-xl">
                      <h4 className="font-bold text-slate-800 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-white text-indigo-600 flex items-center justify-center text-xs">{idx + 1}</span>
                        {criterion.category}
                      </h4>
                      <span className="text-xs font-bold text-slate-500">Weight: {criterion.weight} pts</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      {criterion.levels.sort((a, b) => b.score - a.score).map((level, lIdx) => (
                        <div key={lIdx} className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col gap-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-indigo-600 tracking-tighter">{level.label}</span>
                            <span className="text-xs font-bold text-slate-500">{level.score} pts</span>
                          </div>
                          <p className="text-xs text-slate-500 leading-relaxed font-medium">{level.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 sm:p-6 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-4 shrink-0">
              <button 
                onClick={() => setPreviewRubric(null)}
                className="flex-1 py-4 border border-slate-200 bg-white text-slate-600 rounded-md font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2 text-sm sm:text-base"
              >
                Back to Edit
              </button>
              <button 
                onClick={() => {
                   toast.info('Rubric ready', 'Rubrics are not saved to the server yet.');
                   setPreviewRubric(null);
                   setIsModalOpen(false);
                }}
                className="flex-[2] py-4 bg-indigo-600 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm sm:text-base"
              >
                <CheckCircle2 size={20} /> Finalize Rubric
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results Modal */}
      {resultsAssessment && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setResultsAssessment(null)}></div>
          <div className="relative bg-white rounded-none sm:rounded-xl shadow-xl w-full max-w-4xl overflow-hidden animate-slide-in flex flex-col h-full sm:h-auto sm:max-h-[90vh]">
            <div className="p-6 sm:p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                  <Users size={20} />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900">Assessment Results</h2>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-slate-500">{resultsAssessment.title} • {resultsAssessment.subject}</p>
                    <button 
                      onClick={() => {
                        setSelectedLink(`${window.location.origin}/?assessment=${resultsAssessment.id}`);
                        setShowLinkModal(true);
                      }}
                      className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
                    >
                      <Globe size={12} /> Share Link
                    </button>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setResultsAssessment(null)}
                className="p-2 text-slate-500 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 sm:p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-xs font-bold text-slate-500 mb-1">Total Students</p>
                  <p className="text-lg sm:text-xl font-bold text-slate-900">
                    {attemptsReport ? attemptsReport.summary.assigned : '-'}
                  </p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-xs font-bold text-slate-500 mb-1">Submitted</p>
                  <p className="text-lg sm:text-xl font-bold text-teal-600">
                    {attemptsReport ? attemptsReport.summary.submitted : '-'}
                  </p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-xs font-bold text-slate-500 mb-1">Average Score</p>
                  <p className="text-lg sm:text-xl font-bold text-slate-900">
                    {attemptsReport?.summary.averageScore != null ? `${attemptsReport.summary.averageScore}%` : '-'}
                  </p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-xs font-bold text-slate-500 mb-1">Status</p>
                  <p className="text-lg sm:text-xl font-bold text-amber-600 capitalize">{resultsAssessment.status}</p>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-bold text-slate-900">Student Performance</h4>
                <div className="border border-slate-100 rounded-xl overflow-hidden overflow-x-auto no-scrollbar">
                  <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Student</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Batch / Class</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Status</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Score</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {!attemptsReport && (
                        <tr>
                          <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-500">
                            {attemptsError || 'Loading submissions…'}
                          </td>
                        </tr>
                      )}
                      {attemptsReport && attemptsReport.students.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-500">No students are assigned to this assessment.</td>
                        </tr>
                      )}
                      {attemptsReport?.students.map(row => {
                        const known = students.find(s => s.id === row.studentId);
                        const student = (known || {
                          id: row.studentId,
                          name: row.name,
                          email: row.email,
                          batchId: row.batchId,
                          avatar: row.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
                        }) as Student;
                        const isSubmitted = row.status === 'submitted';
                        const result = isSubmitted ? {
                          assessmentId: resultsAssessment.id,
                          assessmentTitle: resultsAssessment.title,
                          score: row.score ?? 0,
                          // Multiple-choice and true/false answers are stored as option indexes.
                          answers: row.answers.map(ans => {
                            const options = resultsAssessment.questions.find(q => q.id === ans.questionId)?.options;
                            const label = (v: string | number) => (typeof v === 'number' && options?.[v] !== undefined ? options[v] : v);
                            return { ...ans, studentAnswer: label(ans.studentAnswer), correctAnswer: label(ans.correctAnswer) };
                          }),
                          date: row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : '',
                        } : undefined;
                        const isManuallyGraded = false;
                        const score = row.score;
                        const studentBatch = batches.find(b => b.id === student.batchId);

                        return (
                          <tr key={row.studentId} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center font-bold text-xs shrink-0">
                                  {student.avatar}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-slate-900 truncate">{student.name}</p>
                                  <p className="text-xs text-slate-500 truncate">{student.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-700">{studentBatch?.name || 'Unassigned'}</span>
                                <span className="text-xs text-slate-500 font-bold">{studentBatch?.academicYear || 'N/A'}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1">
                                <span className={`px-2 py-1 rounded-lg text-xs font-bold w-fit ${
                                  isSubmitted 
                                    ? 'bg-emerald-50 text-emerald-600' 
                                    : row.status === 'in-progress' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {isSubmitted ? 'SUBMITTED' : row.status === 'in-progress' ? 'IN PROGRESS' : 'NOT STARTED'}
                                </span>
                                {isManuallyGraded && (
                                  <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-xs font-bold w-fit">
                                    MANUALLY GRADED
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm font-bold text-slate-900">
                                {isSubmitted ? `${score}%` : '-'}
                              </p>
                            </td>
                            <td className="px-6 py-4">
                              <button 
                                onClick={() => {
                                  setSelectedStudentSubmission({ student, result });
                                }}
                                className="text-teal-600 text-xs font-bold hover:underline disabled:opacity-30"
                                disabled={!isSubmitted}
                              >
                                View Details
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end shrink-0">
              <button 
                onClick={() => setResultsAssessment(null)}
                className="w-full sm:w-auto px-8 py-3 bg-teal-600 text-white rounded-md font-bold transition-all text-sm sm:text-base"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Submission Detail Modal */}
      {selectedStudentSubmission && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-0 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setSelectedStudentSubmission(null)}></div>
          <div className="relative bg-white rounded-none sm:rounded-xl shadow-xl w-full max-w-4xl overflow-hidden animate-slide-in flex flex-col h-full sm:h-auto sm:max-h-[90vh]">
            <div className="p-6 sm:p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setSelectedStudentSubmission(null)}
                  className="p-2 -ml-2 text-slate-500 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-all"
                  title="Back to Results"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center font-bold shrink-0">
                  {selectedStudentSubmission.student.avatar}
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 truncate">{selectedStudentSubmission.student.name}'s Submission</h2>
                  <p className="text-xs text-slate-500 truncate">{selectedStudentSubmission.result?.assessmentTitle || 'Assessment Details'}</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setSelectedStudentSubmission(null);
                  setResultsAssessment(null);
                }}
                className="p-2 text-slate-500 hover:text-slate-600"
                title="Close All"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 sm:p-6 overflow-y-auto flex-1">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 p-6 bg-slate-50 rounded-xl gap-4">
                <div>
                  <p className="text-xs font-bold text-slate-500 mb-1">Final Score</p>
                  <p className="text-3xl sm:text-4xl font-bold text-teal-600">{selectedStudentSubmission.result?.score || 0}%</p>
                </div>
                <div className="sm:text-right">
                  <p className="text-xs font-bold text-slate-500 mb-1">Submission Date</p>
                  <p className="font-bold text-slate-700 text-sm sm:text-base">{selectedStudentSubmission.result?.date || 'N/A'}</p>
                </div>
              </div>

              <div className="space-y-6">
                <h4 className="text-sm font-bold text-slate-900">Detailed Review</h4>
                {selectedStudentSubmission.result?.answers?.map((answer: any, idx: number) => (
                  <div key={idx} className={`p-5 sm:p-6 rounded-xl border-2 ${answer.isCorrect ? 'border-emerald-100' : 'border-red-100'} space-y-4`}>
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${answer.isCorrect ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                          {idx + 1}
                        </span>
                        <p className="font-bold text-slate-800 text-sm sm:text-base">{answer.questionText}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold  shrink-0 ${answer.isCorrect ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                        {answer.isCorrect ? 'Correct' : 'Incorrect'}
                      </span>
                    </div>

                    <div className="pl-0 sm:pl-9 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                          <p className="text-xs font-bold text-slate-500 mb-1">Student Answer</p>
                          <p className={`text-sm font-bold ${answer.isCorrect ? 'text-emerald-600' : 'text-red-600'}`}>
                            {answer.studentAnswer}
                          </p>
                        </div>
                        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                          <p className="text-xs font-bold text-emerald-400 mb-1">Correct Answer</p>
                          <p className="text-sm font-bold text-emerald-700">
                            {answer.correctAnswer}
                          </p>
                        </div>
                      </div>

                      {/* Manual Grading Section */}
                      <div className="p-4 bg-indigo-50/30 border border-indigo-100 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-indigo-600 flex items-center gap-1">
                            <Edit size={10} /> Manual Grading & Feedback
                          </p>
                          {answer.isManuallyGraded && (
                            <span className="text-xs font-bold text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded">
                              Manually Graded
                            </span>
                          )}
                        </div>
                        
                        <div className="flex flex-col sm:flex-row gap-4">
                          <div className="w-full sm:w-32">
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Score (0-100)</label>
                            <input 
                              type="number"
                              min="0"
                              max="100"
                              value={gradingState[idx]?.score ?? (answer.manualScore !== undefined ? answer.manualScore : (answer.isCorrect ? 100 : 0))}
                              onChange={(e) => setGradingState({
                                ...gradingState,
                                [idx]: { 
                                  score: parseInt(e.target.value) || 0, 
                                  feedback: gradingState[idx]?.feedback ?? (answer.manualFeedback || '') 
                                }
                              })}
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-indigo-500 outline-none"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Feedback to Student</label>
                            <textarea 
                              value={gradingState[idx]?.feedback ?? (answer.manualFeedback || '')}
                              onChange={(e) => setGradingState({
                                ...gradingState,
                                [idx]: { 
                                  score: gradingState[idx]?.score ?? (answer.manualScore !== undefined ? answer.manualScore : (answer.isCorrect ? 100 : 0)), 
                                  feedback: e.target.value 
                                }
                              })}
                              placeholder="Provide specific feedback on this answer..."
                              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm h-20 resize-none focus:border-indigo-500 outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-teal-50/50 border border-teal-100 rounded-xl">
                        <p className="text-xs font-bold text-teal-600 mb-2 flex items-center gap-1">
                          <Sparkles size={10} /> AI Model Answer & Feedback
                        </p>
                        <p className="text-sm text-slate-700 leading-relaxed">
                          {answer.modelAnswer || answer.explanation}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 sm:p-6 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
              <div className="text-xs text-slate-500">
                {Object.keys(gradingState).length > 0 && (
                  <span className="text-indigo-600 font-bold flex items-center gap-1">
                    <Sparkles size={12} /> You have unsaved grading changes
                  </span>
                )}
              </div>
              <div className="flex gap-4 w-full sm:w-auto">
                {Object.keys(gradingState).length > 0 && (
                  <button 
                    onClick={handleSaveGrades}
                    className="flex-1 sm:flex-none px-8 py-3 bg-indigo-600 text-white rounded-md font-bold hover:bg-indigo-700 transition-all text-sm sm:text-base flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={18} /> Save Grades
                  </button>
                )}
                <button 
                  onClick={() => setSelectedStudentSubmission(null)}
                  className="flex-1 sm:flex-none px-8 py-3 bg-teal-600 text-white rounded-md font-bold transition-all text-sm sm:text-base"
                >
                  Close Review
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
