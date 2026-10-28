
import React, { useState, useMemo, useEffect } from 'react';
import { 
  BookOpen, 
  Plus, 
  Upload, 
  Link as LinkIcon, 
  MoreVertical, 
  Search,
  Filter,
  CheckCircle2,
  Clock,
  FileText,
  Users,
  Trash2,
  Edit2,
  X,
  Globe,
  Layers,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  Tag,
  Sparkles,
  Database,
  ShieldCheck
} from 'lucide-react';
import { Curriculum, Batch, Chapter, CourseInstance, Student } from '../types';
import {
  fetchCurriculums,
  createCurriculum,
  updateCurriculum,
  deleteCurriculum,
  deployCurriculum,
  assignBatchToCurriculum,
  unassignBatchFromCurriculum,
  uploadChapterFile,
  uploadChapterVideo,
  fetchBatches,
  createBatch,
  updateBatch,
  deleteBatch,
  fetchCourseInstances,
  createCourseInstance,
  updateCourseInstance,
  deleteCourseInstance,
  assignStudentToCourseInstance,
  removeStudentFromCourseInstance,
  uploadCourseFile,
  fetchStudents,
} from '../services/apiService';
import { toast } from '../services/toastService';

type CourseVisibility = 'student' | 'internal' | 'archived';
// The backend adds `visibility` to course instances; types.ts predates it.
type CourseInstanceRow = CourseInstance & { visibility?: CourseVisibility };

const errorMessage = (err: unknown) => (err instanceof Error && err.message ? err.message : 'Unexpected error');

function generateCourseAutoTags(course: { name: string; courseName?: string; type?: string; level?: string; summary?: string; description?: string }): string[] {
  const text = `${course.name} ${course.courseName||''} ${course.type||''} ${course.level||''} ${course.summary||''} ${course.description||''}`.toLowerCase();
  const tags = new Set<string>();
  if (/math|algebra|calculus|geometry|trigonometry|statistic/.test(text)) { tags.add('#Mathematics'); tags.add('#STEM'); }
  if (/physic|mechanic|thermodynamic|quantum|kinematic/.test(text)) { tags.add('#Physics'); tags.add('#STEM'); }
  if (/chem|molecule|reaction|organic|element/.test(text)) { tags.add('#Chemistry'); tags.add('#STEM'); }
  if (/bio|genetics|cell|organism|ecosystem/.test(text)) { tags.add('#Biology'); tags.add('#LifeSciences'); }
  if (/english|literature|writing|essay|grammar|language/.test(text)) { tags.add('#LanguageArts'); tags.add('#Humanities'); }
  if (/computer|code|python|java|algorithm|data|software|ai|tech/.test(text)) { tags.add('#ComputerScience'); tags.add('#Tech&AI'); }
  if (/grade 10|year 11|secondary|high school/.test(text)) tags.add('#SecondaryEducation');
  if (/advanced|ap|honors|higher/.test(text)) tags.add('#AdvancedLevel');
  if (/national/.test(text)) tags.add('#NationalCurriculum');
  if (/igcse|cambridge/.test(text)) tags.add('#IGCSE');
  if (/ib|baccalaureate/.test(text)) tags.add('#IBProgram');
  if (tags.size === 0) { tags.add('#GeneralCurriculum'); tags.add('#InstitutionalLearning'); }
  tags.add('#AI-Indexed'); tags.add('#SocraticTutor'); tags.add('#ActiveLearning');
  return Array.from(tags);
}

export const CurriculumCenter: React.FC<{ isEnaraAdmin?: boolean }> = () => {
  const [activeTab, setActiveTab] = useState<'curriculums' | 'batches' | 'instances'>('curriculums');
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [courseInstances, setCourseInstances] = useState<CourseInstanceRow[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadAll = async () => {
    setIsLoading(true);
    setLoadError(null);
    const [c, b, i, s] = await Promise.allSettled([
      fetchCurriculums(),
      fetchBatches(),
      fetchCourseInstances(),
      fetchStudents(),
    ]);
    if (c.status === 'fulfilled') setCurriculums(c.value as Curriculum[]);
    if (b.status === 'fulfilled') setBatches(b.value as Batch[]);
    if (i.status === 'fulfilled') setCourseInstances(i.value as CourseInstanceRow[]);
    if (s.status === 'fulfilled') setStudents(s.value as Student[]);
    const failed = [c, b, i, s].find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) {
      const message = errorMessage(failed.reason);
      setLoadError(message);
      toast.error('Could not load curriculum data', message);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  // Search & Filter States
  const [curriculumSearch, setCurriculumSearch] = useState('');
  const [curriculumTypeFilter, setCurriculumTypeFilter] = useState('All Types');
  const [curriculumStatusFilter, setCurriculumStatusFilter] = useState('All Status');
  const [batchSearch, setBatchSearch] = useState('');
  const [batchFilter, setBatchFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  
  const [instanceSearch, setInstanceSearch] = useState('');
  const [instanceYearFilter, setInstanceYearFilter] = useState('All Years');
  const [instanceBatchFilter, setInstanceBatchFilter] = useState('All Batches');

  // Modal States
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showInstanceModal, setShowInstanceModal] = useState(false);
  const [showAssignStudentModal, setShowAssignStudentModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [selectedLink, setSelectedLink] = useState('');
  const [selectedCurriculum, setSelectedCurriculum] = useState<Curriculum | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<CourseInstanceRow | null>(null);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [editingCurriculum, setEditingCurriculum] = useState<Curriculum | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [videoProgress, setVideoProgress] = useState<string | null>(null);

  // Form States for Batch
  const emptyBatchForm = { name: '', studentCount: 0, academicYear: '2023-2024', groupId: '' };
  const [batchForm, setBatchForm] = useState(emptyBatchForm);

  // Form States for Instance
  const emptyInstanceForm = {
    courseId: '',
    courseName: '',
    academicYear: '2023-2024',
    batchId: '',
    curriculumId: '',
    groupId: '',
    visibility: 'student' as CourseVisibility,
  };
  const [instanceForm, setInstanceForm] = useState(emptyInstanceForm);

  // Form States for Curriculum
  const [curriculumForm, setCurriculumForm] = useState({
    name: '',
    courseName: '',
    type: 'National',
    level: 'Grade 10',
    languages: ['English'],
    summary: '',
    description: ''
  });
  const [chapters, setChapters] = useState<Chapter[]>([]);
  // Files picked in the form; uploaded once the curriculum exists on the backend.
  const [pendingFiles, setPendingFiles] = useState<Record<string, File[]>>({});
  const [expandedChapters, setExpandedChapters] = useState<string[]>([]);

  const filteredCurriculums = useMemo(() => {
    return curriculums.filter(c => {
      if (!c) return false;
      const searchLower = curriculumSearch.toLowerCase();
      const matchesSearch = 
        (c.name && c.name.toLowerCase().includes(searchLower)) ||
        (c.id && c.id.toLowerCase().includes(searchLower)) ||
        (c.courseName && c.courseName.toLowerCase().includes(searchLower)) ||
        (c.type && c.type.toLowerCase().includes(searchLower));
      
      const matchesType = curriculumTypeFilter === 'All Types' || c.type === curriculumTypeFilter;
      const matchesStatus = curriculumStatusFilter === 'All Status' || (c.status && c.status === curriculumStatusFilter.toLowerCase());
      
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [curriculums, curriculumSearch, curriculumTypeFilter, curriculumStatusFilter]);

  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      const matchesSearch = b.name.toLowerCase().includes(batchSearch.toLowerCase());
      const matchesFilter = 
        batchFilter === 'all' ? true :
        batchFilter === 'assigned' ? !!b.curriculumId :
        !b.curriculumId;
      return matchesSearch && matchesFilter;
    });
  }, [batches, batchSearch, batchFilter]);

  const filteredInstances = useMemo(() => {
    return courseInstances.filter(inst => {
      const matchesSearch = inst.courseName.toLowerCase().includes(instanceSearch.toLowerCase()) ||
                           inst.courseId.toLowerCase().includes(instanceSearch.toLowerCase());
      const matchesYear = instanceYearFilter === 'All Years' || inst.academicYear === instanceYearFilter;
      const matchesBatch = instanceBatchFilter === 'All Batches' || inst.batchId === instanceBatchFilter;
      
      return matchesSearch && matchesYear && matchesBatch;
    });
  }, [courseInstances, instanceSearch, instanceYearFilter, instanceBatchFilter]);

  const replaceCurriculum = (updated: Curriculum) =>
    setCurriculums(prev => prev.map(c => (c.id === updated.id ? updated : c)));
  const replaceBatch = (updated: Batch) =>
    setBatches(prev => prev.map(b => (b.id === updated.id ? updated : b)));
  const replaceInstance = (updated: CourseInstanceRow) => {
    setCourseInstances(prev => prev.map(i => (i.id === updated.id ? updated : i)));
    setSelectedInstance(prev => (prev && prev.id === updated.id ? updated : prev));
  };

  const handleAssign = async (batchId: string) => {
    if (!selectedCurriculum) return;
    try {
      const res: any = await assignBatchToCurriculum(selectedCurriculum.id, batchId);
      replaceCurriculum(res.curriculum);
      replaceBatch(res.batch);
      toast.success('Batch assigned', `${res.batch?.name || 'Batch'} now follows ${res.curriculum?.name || 'this curriculum'}.`);
      setShowAssignModal(false);
    } catch (err) {
      toast.error('Could not assign batch', errorMessage(err));
    }
  };

  // Uploads the files picked for each chapter; returns the curriculum as the backend now has it.
  const uploadPendingFiles = async (curriculum: Curriculum): Promise<Curriculum> => {
    let latest = curriculum;
    for (const [chapterId, files] of Object.entries(pendingFiles)) {
      if (!latest.chapters.some(ch => ch.id === chapterId)) continue;
      for (const file of files) {
        try {
          const isVideo = /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(file.name) || file.type.startsWith('video/');
          let res: any;
          if (isVideo) {
            setVideoProgress(`${file.name}: preparing…`);
            res = await uploadChapterVideo(latest.id, chapterId, file, (stage, f) =>
              setVideoProgress(`${file.name}: ${stage === 'compressing' ? 'compressing' : 'uploading'} ${Math.round(f * 100)}%`),
            );
            const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
            toast.success(
              'Video uploaded',
              res.compressed ? `${file.name} compressed from ${mb(res.originalBytes)} to ${mb(res.finalBytes)}.` : `${file.name} (${mb(res.finalBytes)}).`,
            );
          } else {
            res = await uploadChapterFile(latest.id, chapterId, file);
          }
          if (res?.curriculum) latest = res.curriculum;
          setPendingFiles(prev => ({ ...prev, [chapterId]: (prev[chapterId] || []).filter(f => f !== file) }));
        } catch (err) {
          toast.error(`Upload failed: ${file.name}`, errorMessage(err));
        } finally {
          setVideoProgress(null);
        }
      }
    }
    // Keep the form in step with the backend so a retry doesn't drop or repeat uploads.
    setChapters(latest.chapters.map(ch => ({ ...ch, uploads: ch.uploads || [] })));
    return latest;
  };

  const handleCreateCurriculum = async (status: 'draft' | 'deployed') => {
    setIsSaving(true);
    const payload = {
      name: curriculumForm.name,
      courseName: curriculumForm.courseName || curriculumForm.name,
      type: curriculumForm.type,
      level: curriculumForm.level,
      languages: curriculumForm.languages,
      summary: curriculumForm.summary,
      description: curriculumForm.description,
      chapters: chapters.map(ch => ({
        id: ch.id,
        title: ch.title,
        uploads: ch.uploads,
        description: ch.description || '',
      })),
    };

    try {
      let saved: Curriculum;
      if (editingCurriculum) {
        saved = (await updateCurriculum(editingCurriculum.id, payload)) as Curriculum;
        saved = await uploadPendingFiles(saved);
        if (status === 'deployed' && saved.status !== 'deployed') {
          saved = (await deployCurriculum(saved.id)) as Curriculum;
        }
        replaceCurriculum(saved);
        toast.success('Curriculum saved', saved.name);
      } else {
        saved = (await createCurriculum({ ...payload, status: 'draft' })) as Curriculum;
        // Insert right away so a failed upload or deploy below doesn't hide the new record;
        // a retry from the still-open form then updates it instead of creating a duplicate.
        setCurriculums(prev => [saved, ...prev]);
        setEditingCurriculum(saved);
        saved = await uploadPendingFiles(saved);
        if (status === 'deployed') {
          saved = (await deployCurriculum(saved.id)) as Curriculum;
        }
        replaceCurriculum(saved);
        toast.success(status === 'deployed' ? 'Curriculum deployed' : 'Draft saved', saved.name);
      }
      setShowUploadModal(false);
      resetCurriculumForm();
    } catch (err) {
      toast.error('Could not save curriculum', errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const resetCurriculumForm = () => {
    setCurriculumForm({
      name: '',
      courseName: '',
      type: 'National',
      level: 'Grade 10',
      languages: ['English'],
      summary: '',
      description: ''
    });
    setChapters([]);
    setPendingFiles({});
    setExpandedChapters([]);
    setEditingCurriculum(null);
  };

  const openEditCurriculum = (curr: Curriculum) => {
    setEditingCurriculum(curr);
    setCurriculumForm({
      name: curr.name || '',
      courseName: curr.courseName || '',
      type: curr.type || 'National',
      level: curr.level || '',
      languages: curr.languages?.length ? curr.languages : ['English'],
      summary: curr.summary || '',
      description: curr.description || ''
    });
    setChapters((curr.chapters || []).map(ch => ({ ...ch, uploads: ch.uploads || [] })));
    setPendingFiles({});
    setExpandedChapters([]);
    setShowUploadModal(true);
  };

  const addChapter = () => {
    const newChapter: Chapter = {
      id: `ch${Date.now()}`,
      title: '',
      uploads: [],
      description: ''
    };
    setChapters(prev => [...prev, newChapter]);
    setExpandedChapters(prev => [...prev, newChapter.id]);
  };

  const updateChapter = (id: string, updates: Partial<Chapter>) => {
    setChapters(prev => prev.map(ch => ch.id === id ? { ...ch, ...updates } : ch));
  };

  const removeChapter = (id: string) => {
    setChapters(prev => prev.filter(ch => ch.id !== id));
    setPendingFiles(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const toggleChapter = (id: string) => {
    setExpandedChapters(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleFileUpload = (chapterId: string, file: File) => {
    setPendingFiles(prev => ({ ...prev, [chapterId]: [...(prev[chapterId] || []), file] }));
  };

  const removeUpload = (chapterId: string, fileName: string) => {
    setChapters(prev => prev.map(ch => 
      ch.id === chapterId ? { ...ch, uploads: ch.uploads.filter(u => u !== fileName) } : ch
    ));
  };

  const removePendingFile = (chapterId: string, file: File) => {
    setPendingFiles(prev => ({ ...prev, [chapterId]: (prev[chapterId] || []).filter(f => f !== file) }));
  };

  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  const copyDeploymentLink = async (link: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(link);
        setCopySuccess('Link copied to clipboard!');
      } else {
        // Fallback for iframes or non-secure contexts
        const textArea = document.createElement("textarea");
        textArea.value = link;
        textArea.style.position = "absolute";
        textArea.style.left = "-999999px";
        document.body.prepend(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          setCopySuccess('Link copied to clipboard!');
        } catch (error) {
          console.error(error);
          setCopySuccess('Failed to copy. Please copy manually: ' + link);
        } finally {
          textArea.remove();
        }
      }
    } catch (err) {
      console.error('Failed to copy text: ', err);
      setCopySuccess('Failed to copy. Please copy manually: ' + link);
    }
    
    setTimeout(() => setCopySuccess(null), 5000);
  };

  const handleDeploy = async (curriculumId: string) => {
    try {
      const deployed = (await deployCurriculum(curriculumId)) as Curriculum;
      replaceCurriculum(deployed);
      toast.success('Curriculum deployed', deployed.name);
    } catch (err) {
      toast.error('Could not deploy curriculum', errorMessage(err));
    }
  };

  const handleDeleteCurriculum = async (curr: Curriculum) => {
    if (!window.confirm(`Delete "${curr.name}"? Batches assigned to it will be unassigned.`)) return;
    try {
      await deleteCurriculum(curr.id);
      setCurriculums(prev => prev.filter(c => c.id !== curr.id));
      setBatches(prev => prev.map(b => (b.curriculumId === curr.id ? { ...b, curriculumId: undefined } : b)));
      toast.success('Curriculum deleted', curr.name);
    } catch (err) {
      toast.error('Could not delete curriculum', errorMessage(err));
    }
  };

  const unassignBatch = async (curriculumId: string, batchName: string) => {
    const batch =
      batches.find(b => b.name === batchName && b.curriculumId === curriculumId) ||
      batches.find(b => b.name === batchName);
    if (!batch) {
      toast.error('Could not unassign batch', `Batch "${batchName}" was not found.`);
      return;
    }
    try {
      const res: any = await unassignBatchFromCurriculum(curriculumId, batch.id);
      replaceCurriculum(res.curriculum);
      replaceBatch(res.batch);
    } catch (err) {
      toast.error('Could not unassign batch', errorMessage(err));
    }
  };

  const handleSaveBatch = async () => {
    setIsSaving(true);
    const data = {
      name: batchForm.name,
      studentCount: batchForm.studentCount,
      academicYear: batchForm.academicYear,
      groupId: batchForm.groupId || undefined,
    };
    try {
      if (editingBatch) {
        const updated = (await updateBatch(editingBatch.id, data)) as Batch;
        replaceBatch(updated);
        // The backend renames the batch in its curriculum's assignedBatches too.
        if (editingBatch.name !== updated.name) {
          setCurriculums(prev => prev.map(c => ({
            ...c,
            assignedBatches: c.assignedBatches.map(name => name === editingBatch.name ? updated.name : name)
          })));
        }
      } else {
        const created = (await createBatch(data)) as Batch;
        setBatches(prev => [...prev, created]);
      }
      setShowBatchModal(false);
      setEditingBatch(null);
      setBatchForm(emptyBatchForm);
    } catch (err) {
      toast.error('Could not save batch', errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveInstance = async () => {
    setIsSaving(true);
    try {
      const created = (await createCourseInstance({
        courseId: instanceForm.courseId.trim(),
        courseName: instanceForm.courseName,
        academicYear: instanceForm.academicYear,
        batchId: instanceForm.batchId,
        curriculumId: instanceForm.curriculumId || undefined,
        groupId: instanceForm.groupId || undefined,
        visibility: instanceForm.visibility,
      })) as CourseInstanceRow;
      setCourseInstances(prev => [created, ...prev]);
      setShowInstanceModal(false);
      setInstanceForm(emptyInstanceForm);
    } catch (err) {
      toast.error('Could not create course instance', errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleVisibilityChange = async (inst: CourseInstanceRow, visibility: CourseVisibility) => {
    try {
      replaceInstance((await updateCourseInstance(inst.id, { visibility })) as CourseInstanceRow);
    } catch (err) {
      toast.error('Could not update visibility', errorMessage(err));
    }
  };

  const handleDeleteInstance = async (inst: CourseInstanceRow) => {
    if (!window.confirm(`Delete course instance "${inst.courseName}"?`)) return;
    try {
      await deleteCourseInstance(inst.id);
      setCourseInstances(prev => prev.filter(i => i.id !== inst.id));
    } catch (err) {
      toast.error('Could not delete course instance', errorMessage(err));
    }
  };

  const [uploadingInstanceId, setUploadingInstanceId] = useState<string | null>(null);

  // Sends a course file to the AI engine for ingestion.
  const handleInstanceFileUpload = async (inst: CourseInstanceRow, file: File) => {
    setUploadingInstanceId(inst.id);
    try {
      await uploadCourseFile(inst.id, file);
      toast.success('File sent for processing', `${file.name} was uploaded to ${inst.courseName}.`);
    } catch (err) {
      toast.error(`Upload failed: ${file.name}`, errorMessage(err));
    } finally {
      setUploadingInstanceId(null);
    }
  };

  const handleAssignStudent = async (studentId: string) => {
    if (!selectedInstance) return;
    try {
      replaceInstance((await assignStudentToCourseInstance(selectedInstance.id, studentId)) as CourseInstanceRow);
      setShowAssignStudentModal(false);
    } catch (err) {
      toast.error('Could not assign student', errorMessage(err));
    }
  };

  const removeStudentFromInstance = async (instanceId: string, studentId: string) => {
    try {
      replaceInstance((await removeStudentFromCourseInstance(instanceId, studentId)) as CourseInstanceRow);
    } catch (err) {
      toast.error('Could not remove student', errorMessage(err));
    }
  };

  const handleDeleteBatch = async (id: string) => {
    const batch = batches.find(b => b.id === id);
    if (!batch) return;
    if (!window.confirm(`Delete batch "${batch.name}"?`)) return;

    try {
      await deleteBatch(id);
      setBatches(prev => prev.filter(b => b.id !== id));
      // The backend also removes it from its curriculum's assigned list.
      setCurriculums(prev => prev.map(c => ({
        ...c,
        assignedBatches: c.assignedBatches.filter(name => name !== batch.name)
      })));
    } catch (err) {
      toast.error('Could not delete batch', errorMessage(err));
    }
  };

  const openBatchModal = (batch?: Batch) => {
    if (batch) {
      setEditingBatch(batch);
      setBatchForm({
        name: batch.name,
        studentCount: batch.studentCount || 0,
        academicYear: batch.academicYear || '2023-2024',
        groupId: batch.groupId || ''
      });
    } else {
      setEditingBatch(null);
      setBatchForm(emptyBatchForm);
    }
    setShowBatchModal(true);
  };

  const handleOpenMaterial = (file: File) => {
    const url = URL.createObjectURL(file);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const uploadLabel = (path: string) => path.split('?')[0].split('/').pop()?.replace(/^[0-9a-f-]{36}-/i, '') || path;

  const listStatus = (isEmpty: boolean, emptyText: string) => {
    if (isLoading) {
      return <div className="col-span-full py-16 text-center text-sm text-slate-500">Loading...</div>;
    }
    if (loadError && isEmpty) {
      return (
        <div className="col-span-full py-16 text-center text-sm text-slate-500">
          Could not load data: {loadError}{' '}
          <button onClick={loadAll} className="text-teal-600 font-bold hover:underline">Retry</button>
        </div>
      );
    }
    if (isEmpty) {
      return <div className="col-span-full py-16 text-center text-sm text-slate-500">{emptyText}</div>;
    }
    return null;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 animate-slide-in relative">
      {copySuccess && (
        <div className="fixed bottom-4 right-4 bg-slate-900 text-white px-6 py-3 rounded-xl shadow-xl z-50 animate-slide-in flex items-center gap-3 max-w-[calc(100vw-2rem)]">
          <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />
          <span className="font-medium text-sm sm:text-base truncate">{copySuccess}</span>
          <button onClick={() => setCopySuccess(null)} aria-label="Dismiss" className="ml-4 text-slate-300 hover:text-white shrink-0">
            <X size={16} />
          </button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
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
            <h1 className="text-3xl font-extrabold text-slate-900 mt-1">Curriculum Center</h1>
            <p className="text-slate-600 mt-1">Manage educational frameworks and batch assignments.</p>
          </div>
        </div>
        <div className="flex gap-3">
          {activeTab === 'curriculums' ? (
            <button 
              onClick={() => setShowUploadModal(true)}
              className="flex-1 sm:flex-none bg-teal-600 hover:bg-teal-700 text-white px-4 sm:px-5 h-11 rounded-md font-semibold flex items-center justify-center gap-2 transition-all text-sm"
            >
              <Plus size={20} />
              Upload Curriculum
            </button>
          ) : activeTab === 'batches' ? (
            <button 
              onClick={() => openBatchModal()}
              className="flex-1 sm:flex-none bg-teal-600 hover:bg-teal-700 text-white px-4 sm:px-5 h-11 rounded-md font-semibold flex items-center justify-center gap-2 transition-all text-sm"
            >
              <Plus size={20} />
              New Batch
            </button>
          ) : (
            <button 
              onClick={() => setShowInstanceModal(true)}
              className="flex-1 sm:flex-none bg-teal-600 hover:bg-teal-700 text-white px-4 sm:px-5 h-11 rounded-md font-semibold flex items-center justify-center gap-2 transition-all text-sm"
            >
              <Plus size={20} />
              New Instance
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 sm:gap-8 border-b border-slate-200 mb-8 overflow-x-auto no-scrollbar">
        <button 
          onClick={() => setActiveTab('curriculums')}
          className={`pb-4 text-sm font-bold transition-all relative whitespace-nowrap ${
            activeTab === 'curriculums' ? 'text-teal-700' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Curriculums
          {activeTab === 'curriculums' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-teal-600 rounded-full" />}
        </button>
        <button 
          onClick={() => setActiveTab('batches')}
          className={`pb-4 text-sm font-bold transition-all relative whitespace-nowrap ${
            activeTab === 'batches' ? 'text-teal-700' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Batches
          {activeTab === 'batches' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-teal-600 rounded-full" />}
        </button>
        <button 
          onClick={() => setActiveTab('instances')}
          className={`pb-4 text-sm font-bold transition-all relative whitespace-nowrap ${
            activeTab === 'instances' ? 'text-teal-700' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Course Instances
          {activeTab === 'instances' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-teal-600 rounded-full" />}
        </button>
      </div>

      {activeTab === 'curriculums' ? (
        <>
          {/* Filters */}
          <div className="flex flex-col lg:flex-row gap-4 mb-8">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input 
                type="text" 
                value={curriculumSearch}
                onChange={(e) => setCurriculumSearch(e.target.value)}
                placeholder="Search curriculums by name, ID, or type..." 
                className="w-full pl-12 pr-4 h-11 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-teal-500/10 transition-all outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <select 
                  value={curriculumTypeFilter}
                  onChange={(e) => setCurriculumTypeFilter(e.target.value)}
                  className="appearance-none pl-10 pr-10 h-11 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/10 transition-all cursor-pointer"
                >
                  <option>All Types</option>
                  <option>National</option>
                  <option>IGCSE</option>
                  <option>IB</option>
                  <option>American</option>
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <select 
                  value={curriculumStatusFilter}
                  onChange={(e) => setCurriculumStatusFilter(e.target.value)}
                  className="appearance-none pl-10 pr-10 h-11 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/10 transition-all cursor-pointer"
                >
                  <option>All Status</option>
                  <option>Draft</option>
                  <option>Deployed</option>
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {listStatus(filteredCurriculums.length === 0, curriculums.length === 0 ? 'No curriculums yet. Click "Upload Curriculum" to create one.' : 'No curriculums match your filters.')}
            {!isLoading && filteredCurriculums.map((curr) => (
              <div key={curr.id} className="bg-white border border-slate-200 rounded-xl p-6 hover:border-teal-200 transition-all group relative overflow-hidden flex flex-col">
                {/* Status Badge */}
                <div className="absolute top-0 right-0">
                  <div className={`px-6 py-2 rounded-bl-2xl text-xs font-bold   ${
                    curr.status === 'deployed' ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-white'
                  }`}>
                    {curr.status}
                  </div>
                </div>

                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="px-2 py-1 bg-slate-100 text-slate-500 text-xs font-mono font-bold rounded">
                      {curr.id}
                    </span>
                    <span className="px-2 py-1 bg-teal-50 text-teal-600 text-xs font-bold rounded">
                      {curr.type}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-teal-600 transition-colors">{curr.name}</h3>
                  <p className="text-sm text-slate-500 line-clamp-2">{curr.summary}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <p className="text-xs font-bold text-slate-500 mb-1">Subjects</p>
                    <p className="text-lg font-bold text-slate-900">{curr.subjectsCount}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <p className="text-xs font-bold text-slate-500 mb-1">Batches</p>
                    <p className="text-lg font-bold text-slate-900">{curr.assignedBatches.length}</p>
                  </div>
                </div>

                {/* Automatic Course Tags */}
                <div className="mb-6 p-3 bg-slate-50/80 rounded-xl border border-slate-100/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                      <Tag size={10} className="text-teal-600" /> Automatic Tags
                    </span>
                    <span className="text-xs font-bold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200/60 flex items-center gap-0.5">
                      <Sparkles size={8} /> Auto-Tagged
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(curr.tags && curr.tags.length > 0 ? curr.tags : generateCourseAutoTags(curr)).map((tag, tagIdx) => (
                      <span key={tagIdx} className="px-2 py-0.5 bg-white text-teal-800 text-xs font-semibold rounded-lg border border-teal-100 shadow-2xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-8">
                  {curr.assignedBatches.length > 0 ? (
                    curr.assignedBatches.slice(0, 2).map((batch, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 px-3 py-1 bg-teal-50 text-teal-700 text-xs font-bold rounded-full border border-teal-100">
                        {batch}
                        <button onClick={() => unassignBatch(curr.id, batch)} className="hover:text-red-600">
                          <X size={10} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500 font-bold">No batches assigned</span>
                  )}
                  {curr.assignedBatches.length > 2 && (
                    <span className="text-xs text-slate-500 font-bold">+{curr.assignedBatches.length - 2} more</span>
                  )}
                </div>

                <div className="mt-auto pt-6 border-t border-slate-50 flex items-center justify-between gap-3">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setSelectedCurriculum(curr);
                        setShowAssignModal(true);
                      }}
                      className="p-3 bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-all"
                      title="Assign to Batch"
                    >
                      <LinkIcon size={18} />
                    </button>
                    {curr.status === 'deployed' && (
                      <button 
                        onClick={() => {
                          setSelectedLink(curr.deploymentLink || '');
                          setShowLinkModal(true);
                        }}
                        className="p-3 bg-teal-50 text-teal-600 rounded-xl hover:bg-teal-100 transition-all border border-teal-100"
                        title="View Deployment Link"
                      >
                        <Globe size={18} />
                      </button>
                    )}
                    {curr.status !== 'deployed' && (
                      <button
                        onClick={() => handleDeploy(curr.id)}
                        disabled={!curr.chapters?.length}
                        className="p-3 bg-teal-50 text-teal-600 rounded-md hover:bg-teal-100 transition-all border border-teal-100 disabled:opacity-40"
                        title={curr.chapters?.length ? 'Deploy Curriculum' : 'Add at least one chapter to deploy'}
                      >
                        <Sparkles size={18} />
                      </button>
                    )}
                    <button
                      onClick={() => openEditCurriculum(curr)}
                      className="p-3 bg-slate-50 text-slate-500 rounded-md hover:bg-slate-100 hover:text-teal-600 transition-all border border-slate-100"
                      title="Edit Curriculum"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDeleteCurriculum(curr)}
                      className="p-3 bg-slate-50 text-slate-500 rounded-md hover:bg-red-50 hover:text-red-600 transition-all border border-slate-100"
                      title="Delete Curriculum"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-500">Last Updated</p>
                    <p className="text-xs font-bold text-slate-600">{curr.lastUpdated}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : activeTab === 'batches' ? (
        <>
          {/* Batch View */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                value={batchSearch}
                onChange={(e) => setBatchSearch(e.target.value)}
                placeholder="Search batches..." 
                className="w-full pl-10 pr-4 h-11.5 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-teal-500/20 transition-all"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {(['all', 'assigned', 'unassigned'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setBatchFilter(filter)}
                  className={`px-4 py-2.5 rounded-md text-sm font-medium capitalize transition-all whitespace-nowrap ${
                    batchFilter === filter 
                      ? 'bg-teal-600 text-white' 
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wide">Batch Name</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wide">Year / Group</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wide">Students</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wide">Assigned Curriculum</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wide text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(isLoading || filteredBatches.length === 0) && (
                  <tr>
                    <td colSpan={5}>
                      {listStatus(filteredBatches.length === 0, batches.length === 0 ? 'No batches yet. Click "New Batch" to create one.' : 'No batches match your filters.')}
                    </td>
                  </tr>
                )}
                {!isLoading && filteredBatches.map((batch) => {
                  const assignedCurriculum = curriculums.find(c => c.id === batch.curriculumId);
                  return (
                    <tr key={batch.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center font-bold text-xs">
                            {batch.name.charAt(0)}
                          </div>
                          <span className="font-bold text-slate-900">{batch.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-slate-700">{batch.academicYear}</span>
                          <span className="text-xs text-slate-500 font-bold">{batch.groupId || 'No Group'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-600 flex items-center gap-1.5">
                          <Users size={14} className="text-slate-400" />
                          {batch.studentCount} Students
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {assignedCurriculum ? (
                          <div className="flex items-center gap-2">
                            <span className="px-3 py-1 bg-teal-50 text-teal-700 text-xs font-semibold rounded-full border border-teal-100">
                              {assignedCurriculum.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">No curriculum assigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => openBatchModal(batch)}
                            className="p-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-all"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleDeleteBatch(batch.id)}
                            className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {/* Course Instances View */}
          <div className="flex flex-col lg:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                value={instanceSearch}
                onChange={(e) => setInstanceSearch(e.target.value)}
                placeholder="Search instances by course name or ID..." 
                className="w-full pl-10 pr-4 h-11.5 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-teal-500/20 transition-all"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select 
                value={instanceYearFilter}
                onChange={(e) => setInstanceYearFilter(e.target.value)}
                className="px-4 h-11.5 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-600 outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
              >
                <option>All Years</option>
                <option>2023-2024</option>
                <option>2024-2025</option>
              </select>
              <select 
                value={instanceBatchFilter}
                onChange={(e) => setInstanceBatchFilter(e.target.value)}
                className="px-4 h-11.5 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-600 outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
              >
                <option value="All Batches">All Batches</option>
                {batches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {listStatus(filteredInstances.length === 0, courseInstances.length === 0 ? 'No course instances yet. Click "New Instance" to create one.' : 'No course instances match your filters.')}
            {!isLoading && filteredInstances.map((inst) => {
              const batch = batches.find(b => b.id === inst.batchId);
              const curriculum = curriculums.find(c => c.id === inst.curriculumId);
              return (
                <div key={inst.id} className="bg-white border border-slate-200 rounded-xl p-6 hover:border-teal-200 transition-all flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{inst.courseName}</h3>
                      <p className="text-xs text-slate-500 font-mono">{inst.courseId}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-md">
                        {inst.academicYear}
                      </span>
                      <button
                        onClick={() => handleDeleteInstance(inst)}
                        className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        title="Delete Instance"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-3 mb-6 flex-1">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Layers size={16} className="text-slate-400" />
                      <span>Batch: <span className="font-semibold">{batch?.name || 'Unknown'}</span></span>
                    </div>
                    {curriculum && (
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <BookOpen size={16} className="text-slate-400" />
                        <span>Curriculum: <span className="font-semibold text-teal-600">{curriculum.name}</span> <span className="text-xs text-slate-500 font-mono ml-1">({curriculum.id})</span></span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Users size={16} className="text-slate-400" />
                      <span>Students: <span className="font-semibold">{inst.studentIds.length}</span></span>
                    </div>
                    {inst.groupId && (
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Users size={16} className="text-slate-400" />
                        <span>Group: <span className="font-semibold">{inst.groupId}</span></span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <ShieldCheck size={16} className="text-slate-400" />
                      <span>Visibility:</span>
                      <select
                        value={inst.visibility || 'internal'}
                        onChange={(e) => handleVisibilityChange(inst, e.target.value as CourseVisibility)}
                        className="px-2 py-1 bg-white border border-slate-300 rounded-md text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/20"
                        title="Students only see courses with Student visibility"
                      >
                        <option value="student">Student</option>
                        <option value="internal">Internal</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-6">
                    {inst.studentIds.slice(0, 3).map(id => {
                      const student = students.find(s => s.id === id);
                      return (
                        <div key={id} className="flex items-center gap-1.5 px-2 py-1 bg-teal-50 text-teal-700 text-xs font-bold rounded-full border border-teal-100">
                          {student?.name || id}
                          <button onClick={() => removeStudentFromInstance(inst.id, id)} className="hover:text-red-600">
                            <X size={10} />
                          </button>
                        </div>
                      );
                    })}
                    {inst.studentIds.length > 3 && (
                      <span className="text-xs text-slate-500 font-bold">+{inst.studentIds.length - 3} more</span>
                    )}
                  </div>

                  <button 
                    onClick={() => {
                      setSelectedInstance(inst);
                      setShowAssignStudentModal(true);
                    }}
                    className="w-full py-2.5 bg-slate-50 text-slate-600 text-sm font-bold rounded-xl hover:bg-teal-50 hover:text-teal-600 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus size={18} />
                    Assign Students
                  </button>
                  <label className={`mt-2 w-full py-2.5 bg-slate-50 text-slate-600 text-sm font-bold rounded-xl hover:bg-teal-50 hover:text-teal-600 transition-all flex items-center justify-center gap-2 ${uploadingInstanceId === inst.id ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
                    <Upload size={18} />
                    {uploadingInstanceId === inst.id ? 'Uploading...' : 'Upload Course Material'}
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) handleInstanceFileUpload(inst, file);
                      }}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Assign Modal */}
      {showAssignModal && selectedCurriculum && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl animate-slide-in overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Assign Curriculum</h2>
                <p className="text-sm text-slate-500 mt-1">Assigning: {selectedCurriculum.name}</p>
              </div>
              <button onClick={() => setShowAssignModal(false)} className="p-2 text-slate-500 hover:bg-slate-50 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-3 max-h-[400px] overflow-y-auto">
              {batches.map((batch) => (
                <button
                  key={batch.id}
                  onClick={() => handleAssign(batch.id)}
                  disabled={batch.curriculumId === selectedCurriculum.id}
                  className={`w-full p-4 rounded-md border text-left transition-all flex items-center justify-between group ${
                    batch.curriculumId === selectedCurriculum.id
                      ? 'bg-slate-50 border-slate-100 opacity-60 cursor-not-allowed'
                      : 'border-slate-200 hover:border-teal-500 hover:bg-teal-50/30'
                  }`}
                >
                  <div>
                    <p className="font-bold text-slate-900">{batch.name}</p>
                    <p className="text-xs text-slate-500">{batch.studentCount} Students</p>
                  </div>
                  {batch.curriculumId === selectedCurriculum.id ? (
                    <CheckCircle2 className="text-emerald-500" size={20} />
                  ) : (
                    <Plus className="text-slate-300 group-hover:text-teal-500" size={20} />
                  )}
                </button>
              ))}
            </div>
            <div className="p-6 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setShowAssignModal(false)}
                className="px-6 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <h2 className="text-xl font-bold text-slate-900">Course Access Link</h2>
                </div>
                <button 
                  onClick={() => setShowLinkModal(false)} 
                  className="p-2 text-slate-500 hover:bg-slate-50 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <p className="text-slate-500 text-sm mb-6">
                Share this unique link with your students. They will be taken directly to the course content after logging in.
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-8 group relative">
                <div className="flex items-center justify-between gap-4">
                  <code className="text-sm text-indigo-600 font-mono break-all select-all">
                    {selectedLink}
                  </code>
                  <button 
                    onClick={() => copyDeploymentLink(selectedLink)}
                    className="shrink-0 p-3 bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 rounded-md transition-all"
                    title="Copy to Clipboard"
                  >
                    <Copy size={20} />
                  </button>
                </div>
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
                  Open Course
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Modal (Create/Edit) */}
      {showBatchModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl animate-slide-in">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-slate-900">{editingBatch ? 'Edit Batch' : 'New Batch'}</h2>
                <button onClick={() => setShowBatchModal(false)} className="p-2 text-slate-500 hover:bg-slate-50 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Batch Name</label>
                  <input 
                    type="text" 
                    value={batchForm.name}
                    onChange={(e) => setBatchForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 h-11 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500/20" 
                    placeholder="e.g. Batch E - 2024" 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Academic Year</label>
                    <select 
                      value={batchForm.academicYear}
                      onChange={(e) => setBatchForm(prev => ({ ...prev, academicYear: e.target.value }))}
                      className="w-full px-4 h-11 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500/20"
                    >
                      <option>2023-2024</option>
                      <option>2024-2025</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Group ID</label>
                    <input 
                      type="text" 
                      value={batchForm.groupId}
                      onChange={(e) => setBatchForm(prev => ({ ...prev, groupId: e.target.value }))}
                      className="w-full px-4 h-11 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500/20" 
                      placeholder="e.g. Group A" 
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Student Count</label>
                  <input 
                    type="number" 
                    value={batchForm.studentCount}
                    onChange={(e) => setBatchForm(prev => ({ ...prev, studentCount: parseInt(e.target.value) || 0 }))}
                    className="w-full px-4 h-11 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500/20" 
                    placeholder="0" 
                  />
                </div>
              </div>

              <div className="flex gap-4 mt-10">
                <button 
                  onClick={() => setShowBatchModal(false)}
                  className="flex-1 px-6 py-3 border border-slate-200 rounded-md font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveBatch}
                  disabled={!batchForm.name || isSaving}
                  className="flex-1 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-bold transition-all disabled:opacity-50 disabled:hover:scale-100"
                >
                  {editingBatch ? 'Save Changes' : 'Create Batch'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl animate-slide-in max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-2xl font-bold text-slate-900">{editingCurriculum ? 'Edit Curriculum' : 'Create Curriculum'}</h2>
                <button 
                  onClick={() => {
                    setShowUploadModal(false);
                    resetCurriculumForm();
                  }} 
                  className="p-2 text-slate-500 hover:bg-slate-50 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <p className="text-slate-500 mb-8">Define your educational framework and structure.</p>
              
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Curriculum Name</label>
                    <input 
                      type="text" 
                      value={curriculumForm.name}
                      onChange={(e) => setCurriculumForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-4 h-11 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500/20" 
                      placeholder="e.g. British Council - Year 11" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Course Name</label>
                    <input 
                      type="text" 
                      value={curriculumForm.courseName}
                      onChange={(e) => setCurriculumForm(prev => ({ ...prev, courseName: e.target.value }))}
                      className="w-full px-4 h-11 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500/20" 
                      placeholder="e.g. Secondary Mathematics" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Type</label>
                    <select 
                      value={curriculumForm.type}
                      onChange={(e) => setCurriculumForm(prev => ({ ...prev, type: e.target.value }))}
                      className="w-full px-4 h-11 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500/20"
                    >
                      <option>National</option>
                      <option>IGCSE</option>
                      <option>IB</option>
                      <option>American</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Level (AI Context)</label>
                    <input 
                      type="text" 
                      value={curriculumForm.level}
                      onChange={(e) => setCurriculumForm(prev => ({ ...prev, level: e.target.value }))}
                      className="w-full px-4 h-11 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500/20" 
                      placeholder="e.g. Grade 10 / Advanced" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Languages (Multiple)</label>
                  <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    {['English', 'Arabic', 'French', 'Spanish', 'German'].map(lang => (
                      <button
                        key={lang}
                        onClick={() => {
                          const langs = curriculumForm.languages.includes(lang)
                            ? curriculumForm.languages.filter(l => l !== lang)
                            : [...curriculumForm.languages, lang];
                          setCurriculumForm(prev => ({ ...prev, languages: langs }));
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                          curriculumForm.languages.includes(lang)
                            ? 'bg-teal-600 text-white'
                            : 'bg-white text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Curriculum Summary (Mandatory for AI)</label>
                  <textarea 
                    value={curriculumForm.summary}
                    onChange={(e) => setCurriculumForm(prev => ({ ...prev, summary: e.target.value }))}
                    rows={2}
                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500/20 resize-none" 
                    placeholder="Provide a high-level summary for AI context..."
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-4">
                    <label className="text-sm font-bold text-slate-700">Chapter Structure</label>
                    <button 
                      onClick={addChapter}
                      className="text-teal-600 text-xs font-bold flex items-center gap-1 hover:underline"
                    >
                      <Plus size={14} /> Add Chapter
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    {chapters.map((chapter, idx) => (
                      <div key={chapter.id} className="border border-slate-200 rounded-xl overflow-hidden">
                        <div 
                          className="p-4 bg-slate-50 flex items-center justify-between cursor-pointer"
                          onClick={() => toggleChapter(chapter.id)}
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                              {idx + 1}
                            </span>
                            <input 
                              type="text"
                              value={chapter.title}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateChapter(chapter.id, { title: e.target.value })}
                              placeholder="Chapter Title"
                              className="bg-transparent font-medium text-slate-900 border-none focus:ring-0 p-0 placeholder:text-slate-400"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                removeChapter(chapter.id);
                              }}
                              className="p-1.5 text-slate-500 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                            {expandedChapters.includes(chapter.id) ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </div>
                        </div>
                        
                        {expandedChapters.includes(chapter.id) && (
                          <div className="p-4 bg-white space-y-4 animate-slide-in">
                            <textarea 
                              value={chapter.description}
                              onChange={(e) => updateChapter(chapter.id, { description: e.target.value })}
                              rows={2}
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs focus:ring-2 focus:ring-teal-500/20 resize-none" 
                              placeholder="Chapter description..."
                            />
                            
                            <div className="space-y-2">
                              <p className="text-xs font-bold text-slate-500">Multi-Uploads</p>
                              <div className="flex flex-wrap gap-2">
                                  {chapter.uploads.map((file, fIdx) => (
                                    <div 
                                      key={fIdx} 
                                      title={file}
                                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 transition-all"
                                    >
                                      <FileText size={12} />
                                      {uploadLabel(file)}
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeUpload(chapter.id, file);
                                        }} 
                                        className="hover:text-red-500 ml-1"
                                      >
                                        <X size={12} />
                                      </button>
                                    </div>
                                  ))}
                                  {(pendingFiles[chapter.id] || []).map((file, fIdx) => (
                                    <div 
                                      key={`pending-${fIdx}`} 
                                      onClick={() => handleOpenMaterial(file)}
                                      title="Uploads when you save"
                                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg border border-dashed border-slate-300 cursor-pointer hover:bg-white hover:border-teal-200 transition-all"
                                    >
                                      <FileText size={12} />
                                      {file.name}
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removePendingFile(chapter.id, file);
                                        }} 
                                        className="hover:text-red-500 ml-1"
                                      >
                                        <X size={12} />
                                      </button>
                                    </div>
                                  ))}
                                <label className="px-3 py-1.5 bg-teal-50 text-teal-700 text-xs font-bold rounded-lg border border-teal-100 cursor-pointer hover:bg-teal-100 flex items-center gap-1">
                                  <Upload size={12} />
                                  Upload
                                  <input 
                                    type="file" 
                                    className="hidden" 
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      e.target.value = '';
                                      if (file) handleFileUpload(chapter.id, file);
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {chapters.length === 0 && (
                      <div className="p-6 border-2 border-dashed border-slate-100 rounded-xl text-center">
                        <p className="text-sm text-slate-500">No chapters added yet. Click "Add Chapter" to start building the structure.</p>
                      </div>
                    )}
                  </div>
                </div>
                {/* Dynamic Auto-Generated Tags Preview */}
                <div className="p-4 bg-teal-50/80 rounded-xl border border-teal-100/90 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                      <Sparkles size={14} className="text-teal-600" /> Automatic Taxonomy Tags
                    </span>
                    <span className="px-2 py-0.5 rounded bg-teal-600 text-white text-xs font-bold">
                      Preview
                    </span>
                  </div>
                  <p className="text-xs text-teal-800 leading-relaxed">
                    Enara generates taxonomy tags from your course subject, academic level, and curriculum system:
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {generateCourseAutoTags({
                      name: curriculumForm.name || 'New Course',
                      courseName: curriculumForm.courseName,
                      type: curriculumForm.type,
                      level: curriculumForm.level,
                      summary: curriculumForm.summary,
                      description: curriculumForm.description
                    }).map((tag, tIdx) => (
                      <span key={tIdx} className="px-2.5 py-1 bg-white text-teal-800 font-mono font-bold text-xs rounded-xl border border-teal-200 shadow-2xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {videoProgress && (
                <p role="status" aria-live="polite" className="mt-6 text-sm font-semibold text-teal-700">
                  {videoProgress}. Keep this tab open.
                </p>
              )}
              <div className="flex flex-col sm:flex-row gap-4 mt-10">
                <button 
                  onClick={() => handleCreateCurriculum('draft')}
                  disabled={!curriculumForm.name || !curriculumForm.summary || isSaving}
                  className="flex-1 px-6 py-3 border border-slate-200 rounded-md font-bold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Database size={16} />
                  {isSaving ? 'Saving...' : editingCurriculum?.status === 'deployed' ? 'Save Changes' : 'Save Draft'}
                </button>
                <button 
                  onClick={() => handleCreateCurriculum('deployed')}
                  disabled={!curriculumForm.name || !curriculumForm.summary || chapters.length === 0 || isSaving || editingCurriculum?.status === 'deployed'}
                  className="flex-1 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-bold transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                >
                  <Sparkles size={16} />
                  {isSaving ? 'Deploying...' : editingCurriculum?.status === 'deployed' ? 'Deployed' : 'Save & Deploy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Instance Modal (Create) */}
      {showInstanceModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl animate-slide-in">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-slate-900">New Course Instance</h2>
                <button onClick={() => setShowInstanceModal(false)} className="p-2 text-slate-500 hover:bg-slate-50 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Course ID</label>
                  <input 
                    type="text" 
                    value={instanceForm.courseId}
                    onChange={(e) => setInstanceForm(prev => ({ ...prev, courseId: e.target.value }))}
                    className="w-full px-4 h-11 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500/20" 
                    placeholder="e.g. MATH101" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Course Name</label>
                  <input 
                    type="text" 
                    value={instanceForm.courseName}
                    onChange={(e) => setInstanceForm(prev => ({ ...prev, courseName: e.target.value }))}
                    className="w-full px-4 h-11 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500/20" 
                    placeholder="e.g. Algebra Fundamentals" 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Academic Year</label>
                    <select 
                      value={instanceForm.academicYear}
                      onChange={(e) => setInstanceForm(prev => ({ ...prev, academicYear: e.target.value }))}
                      className="w-full px-4 h-11 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500/20"
                    >
                      <option>2023-2024</option>
                      <option>2024-2025</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Batch</label>
                    <select 
                      value={instanceForm.batchId}
                      onChange={(e) => setInstanceForm(prev => ({ ...prev, batchId: e.target.value }))}
                      className="w-full px-4 h-11 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500/20"
                    >
                      <option value="">Select Batch</option>
                      {batches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Linked Curriculum (Optional)</label>
                  <select 
                    value={instanceForm.curriculumId}
                    onChange={(e) => setInstanceForm(prev => ({ ...prev, curriculumId: e.target.value }))}
                    className="w-full px-4 h-11 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500/20"
                  >
                    <option value="">Select Curriculum</option>
                    {curriculums.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Group ID (Optional)</label>
                  <input 
                    type="text" 
                    value={instanceForm.groupId}
                    onChange={(e) => setInstanceForm(prev => ({ ...prev, groupId: e.target.value }))}
                    className="w-full px-4 h-11 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500/20" 
                    placeholder="e.g. Group A" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Visibility</label>
                  <select 
                    value={instanceForm.visibility}
                    onChange={(e) => setInstanceForm(prev => ({ ...prev, visibility: e.target.value as CourseVisibility }))}
                    className="w-full px-4 h-11 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-teal-500/20"
                  >
                    <option value="student">Student (visible to assigned students)</option>
                    <option value="internal">Internal (staff only)</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-4 mt-10">
                <button 
                  onClick={() => setShowInstanceModal(false)}
                  className="flex-1 px-6 py-3 border border-slate-200 rounded-md font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveInstance}
                  disabled={!instanceForm.courseId || !instanceForm.courseName || !instanceForm.batchId || isSaving}
                  className="flex-1 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-bold transition-all disabled:opacity-50 disabled:hover:scale-100"
                >
                  Create Instance
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Student Modal */}
      {showAssignStudentModal && selectedInstance && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl animate-slide-in overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Assign Students</h2>
                <p className="text-sm text-slate-500 mt-1">Instance: {selectedInstance.courseName}</p>
              </div>
              <button onClick={() => setShowAssignStudentModal(false)} className="p-2 text-slate-500 hover:bg-slate-50 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-3 max-h-[400px] overflow-y-auto">
              {students.filter(s => !selectedInstance.studentIds.includes(s.id)).map((student) => (
                <button
                  key={student.id}
                  onClick={() => handleAssignStudent(student.id)}
                  className="w-full p-4 rounded-md border border-slate-200 text-left transition-all flex items-center justify-between group hover:border-teal-500 hover:bg-teal-50/30"
                >
                  <div>
                    <p className="font-bold text-slate-900">{student.name}</p>
                    <p className="text-xs text-slate-500">{student.id} • {student.grade}</p>
                  </div>
                  <Plus className="text-slate-300 group-hover:text-teal-500" size={20} />
                </button>
              ))}
              {students.filter(s => !selectedInstance.studentIds.includes(s.id)).length === 0 && (
                <p className="text-center text-slate-500 py-8">All students are already assigned to this instance.</p>
              )}
            </div>
            <div className="p-6 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setShowAssignStudentModal(false)}
                className="px-6 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
