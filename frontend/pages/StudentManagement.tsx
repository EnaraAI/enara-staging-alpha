
import React, { useState, useEffect } from 'react';
import { 
  Search, MoreVertical, Eye, EyeOff, Mail, Award,
  ChevronLeft, X, Send, CheckCircle2, Plus, GraduationCap, Users, 
  TrendingUp, Zap, Database, BookOpen, Check, Lock, Key, Copy, Sparkles, Pencil, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Student } from '../types';
import {
  ApiError,
  assignStudentToCourseInstance,
  createStudent,
  createUserAccount,
  deleteStudent,
  fetchCourseInstances,
  fetchStudents,
  removeStudentFromCourseInstance,
  updateStudent,
} from '../services/apiService';
import { toast } from '../services/toastService';

interface StudentManagementProps {
  students: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  onViewStudent: (student: Student) => void;
  onViewDeepAnalytics?: (student: Student) => void;
}

interface CourseInstanceItem {
  id: string;
  courseId: string;
  courseName: string;
  academicYear?: string;
  batchId?: string;
  studentIds?: string[];
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Unexpected error');

// Random password that satisfies the backend rule (8+ characters).
const generateSecurePassword = () => {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%&*'];
  const all = sets.join('');
  const rand = (max: number) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % max;
  };
  const chars = sets.map(set => set[rand(set.length)]);
  while (chars.length < 14) chars.push(all[rand(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

const emptyNewStudent = () => ({
  name: '',
  email: '',
  grade: 'Grade 10',
  password: generateSecurePassword()
});

export const StudentManagement: React.FC<StudentManagementProps> = ({ students, setStudents, onViewStudent, onViewDeepAnalytics }) => {
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [newStudent, setNewStudent] = useState(emptyNewStudent);
  // Holds the generated password only until the admin closes the success screen.
  const [createdCredentials, setCreatedCredentials] = useState<{
    name: string;
    email: string;
    password: string;
    studentId: string;
    courses: string[];
  } | null>(null);
  const [copiedNewStudentCredentials, setCopiedNewStudentCredentials] = useState(false);

  // Account details modal for existing students
  const [isCredentialsModalOpen, setIsCredentialsModalOpen] = useState(false);
  const [studentForCredentials, setStudentForCredentials] = useState<Student | null>(null);
  const [copiedCredModal, setCopiedCredModal] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('All Grades');
  const [moduleFilter, setModuleFilter] = useState('All Modules');
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);

  const [courseInstances, setCourseInstances] = useState<CourseInstanceItem[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [selectedCourseIdsForNewStudent, setSelectedCourseIdsForNewStudent] = useState<string[]>([]);
  
  // Commit Courses Modal state
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false);
  const [studentToCommit, setStudentToCommit] = useState<Student | null>(null);
  const [committingCourseIds, setCommittingCourseIds] = useState<string[]>([]);
  const [isSubmittingCommit, setIsSubmittingCommit] = useState(false);
  const [commitSuccess, setCommitSuccess] = useState(false);

  // Edit / delete state
  const [menuStudentId, setMenuStudentId] = useState<string | null>(null);
  const [studentToEdit, setStudentToEdit] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', grade: 'Grade 10' });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deletingStudentId, setDeletingStudentId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStudents()
      .then(list => { if (!cancelled) setStudents(list as Student[]); })
      .catch(err => { if (!cancelled) toast.error('Could not load students', errorMessage(err)); })
      .finally(() => { if (!cancelled) setIsLoadingStudents(false); });
    fetchCourseInstances()
      .then(list => { if (!cancelled) setCourseInstances(list as CourseInstanceItem[]); })
      .catch(err => { if (!cancelled) toast.error('Could not load course instances', errorMessage(err)); })
      .finally(() => { if (!cancelled) setIsLoadingCourses(false); });
    return () => { cancelled = true; };
  }, [setStudents]);

  // Drop the one-time password as soon as the add-student modal closes.
  useEffect(() => {
    if (!isAddStudentModalOpen && createdCredentials) {
      setCreatedCredentials(null);
      setShowSuccess(false);
      setShowPassword(false);
      setNewStudent(emptyNewStudent());
      setSelectedCourseIdsForNewStudent([]);
    }
  }, [isAddStudentModalOpen, createdCredentials]);

  // Get unique modules for the filter dropdown
  const uniqueModules = Array.from(new Set(students.map(s => s.currentModule))).filter(Boolean);

  const filteredStudents = students.filter(s => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = (s.name || '').toLowerCase().includes(q) || 
                         (s.email || '').toLowerCase().includes(q) ||
                         (s.id || '').toLowerCase().includes(q);
    const matchesGrade = gradeFilter === 'All Grades' || s.grade === gradeFilter;
    const matchesModule = moduleFilter === 'All Modules' || s.currentModule === moduleFilter;
    
    return matchesSearch && matchesGrade && matchesModule;
  });

  const courseLabel = (c: CourseInstanceItem) => c.courseName || c.courseId;
  const enrolledInstances = (studentId: string) =>
    courseInstances.filter(c => (c.studentIds || []).includes(studentId));
  const replaceInstance = (updated: CourseInstanceItem) =>
    setCourseInstances(prev => prev.map(c => (c.id === updated.id ? updated : c)));

  const toggleNewStudentCourse = (courseId: string) => {
    setSelectedCourseIdsForNewStudent(prev => 
      prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId]
    );
  };

  const handleOpenCommitModal = (student: Student) => {
    setStudentToCommit(student);
    setCommittingCourseIds(enrolledInstances(student.id).map(c => c.id));
    setCommitSuccess(false);
    setIsCommitModalOpen(true);
  };

  const toggleCommitCourse = (courseId: string) => {
    setCommittingCourseIds(prev => 
      prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId]
    );
  };

  const handleSaveCommitCourses = async () => {
    if (!studentToCommit) return;
    setIsSubmittingCommit(true);

    const current = enrolledInstances(studentToCommit.id).map(c => c.id);
    const toAdd = committingCourseIds.filter(id => !current.includes(id));
    const toRemove = current.filter(id => !committingCourseIds.includes(id));
    const failures: string[] = [];

    for (const id of toAdd) {
      try {
        replaceInstance(await assignStudentToCourseInstance(id, studentToCommit.id) as CourseInstanceItem);
      } catch (err) {
        failures.push(errorMessage(err));
      }
    }
    for (const id of toRemove) {
      try {
        replaceInstance(await removeStudentFromCourseInstance(id, studentToCommit.id) as CourseInstanceItem);
      } catch (err) {
        failures.push(errorMessage(err));
      }
    }

    setIsSubmittingCommit(false);
    if (failures.length > 0) {
      toast.error('Some enrollments were not saved', failures.join('; '));
      return;
    }
    setCommitSuccess(true);
    setTimeout(() => {
      setIsCommitModalOpen(false);
      setCommitSuccess(false);
    }, 1500);
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.name || !newStudent.email) return;
    if (newStudent.password.length < 8) {
      toast.warning('Password too short', 'Passwords must be at least 8 characters.');
      return;
    }
    setIsSubmitting(true);

    let created: Student;
    try {
      created = await createStudent({
        name: newStudent.name.trim(),
        email: newStudent.email.trim(),
        grade: newStudent.grade,
      }) as Student;
    } catch (err) {
      toast.error('Could not create student', errorMessage(err));
      setIsSubmitting(false);
      return;
    }

    // Create the login; the backend links it to the student record by email.
    try {
      await createUserAccount({
        email: created.email,
        password: newStudent.password,
        name: created.name,
        role: 'student',
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // A login already exists for this email; keep the student record and its existing password.
        setStudents(prev => [created, ...prev]);
        toast.warning('Student added', `A login already exists for ${created.email}, so no new password was set.`);
        setIsSubmitting(false);
        setIsAddStudentModalOpen(false);
        setNewStudent(emptyNewStudent());
        setSelectedCourseIdsForNewStudent([]);
        return;
      }
      // Roll back the student record so the admin can retry cleanly.
      await deleteStudent(created.id).catch(() => undefined);
      toast.error('Could not create login account', errorMessage(err));
      setIsSubmitting(false);
      return;
    }

    const enrolledTitles: string[] = [];
    const enrollFailures: string[] = [];
    for (const id of selectedCourseIdsForNewStudent) {
      const instance = courseInstances.find(c => c.id === id);
      try {
        replaceInstance(await assignStudentToCourseInstance(id, created.id) as CourseInstanceItem);
        enrolledTitles.push(instance ? courseLabel(instance) : id);
      } catch (err) {
        enrollFailures.push(`${instance ? courseLabel(instance) : id}: ${errorMessage(err)}`);
      }
    }
    if (enrollFailures.length > 0) {
      toast.warning('Some courses were not assigned', enrollFailures.join('; '));
    }

    setCreatedCredentials({
      name: created.name,
      email: created.email,
      password: newStudent.password,
      studentId: created.id,
      courses: enrolledTitles
    });
    setStudents(prev => [created, ...prev]);
    setIsSubmitting(false);
    setShowSuccess(true);
  };

  const openEditStudent = (student: Student) => {
    setMenuStudentId(null);
    setStudentToEdit(student);
    setEditForm({ name: student.name || '', email: student.email || '', grade: student.grade || 'Grade 10' });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentToEdit) return;
    setIsSavingEdit(true);
    try {
      const updated = await updateStudent(studentToEdit.id, {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        grade: editForm.grade,
      }) as Student;
      setStudents(prev => prev.map(s => (s.id === updated.id ? updated : s)));
      toast.success('Student updated', `${updated.name} was saved.`);
      setStudentToEdit(null);
    } catch (err) {
      toast.error('Could not update student', errorMessage(err));
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteStudent = async (student: Student) => {
    setMenuStudentId(null);
    if (!window.confirm(`Delete ${student.name}? This removes the student record.`)) return;
    setDeletingStudentId(student.id);
    try {
      await deleteStudent(student.id);
      setStudents(prev => prev.filter(s => s.id !== student.id));
      toast.success('Student deleted', `${student.name} was removed.`);
    } catch (err) {
      toast.error('Could not delete student', errorMessage(err));
    } finally {
      setDeletingStudentId(null);
    }
  };

  const renderStudentMenu = (s: Student, className: string) => (
    <div className={className} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setMenuStudentId(menuStudentId === s.id ? null : s.id)}
        disabled={deletingStudentId === s.id}
        className="p-2 text-slate-500 hover:text-slate-600 rounded-full hover:bg-slate-50 transition-colors disabled:opacity-50"
        title="More options"
      >
        <MoreVertical size={18} />
      </button>
      {menuStudentId === s.id && (
        <div className="absolute right-0 mt-1 w-36 bg-white border border-slate-200 rounded-xl z-20 overflow-hidden text-left">
          <button
            onClick={() => openEditStudent(s)}
            className="w-full px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
          >
            <Pencil size={12} /> Edit
          </button>
          <button
            onClick={() => handleDeleteStudent(s)}
            className="w-full px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-2"
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      )}
    </div>
  );

  const handleSendMessage = () => {
    if (!message.trim()) return;
    setIsSending(true);
    // Mock sending
    setTimeout(() => {
      setIsSending(false);
      setSendSuccess(true);
      setTimeout(() => {
        setSendSuccess(false);
        setIsMessageModalOpen(false);
        setMessage('');
      }, 2000);
    }, 1000);
  };

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
            <h1 className="text-3xl font-extrabold text-slate-900 mt-1">Student Directory</h1>
            <p className="text-slate-600 mt-1">Manage and track enrollment across all departments</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-white border border-slate-300 p-1 rounded-md flex flex-1 sm:flex-none" role="group" aria-label="View mode">
            <button 
              onClick={() => setView('grid')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view === 'grid' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Grid
            </button>
            <button 
              onClick={() => setView('table')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view === 'table' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Table
            </button>
          </div>
          <button 
            onClick={() => setIsAddStudentModalOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 h-11 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold transition-all"
          >
            <Plus size={18} /> Add Student
          </button>
          <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 h-11 rounded-md bg-white border border-slate-300 text-slate-700 text-sm font-bold hover:bg-slate-50 transition-all">
            Import Students
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row flex-wrap gap-4 items-stretch sm:items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search by name, email or ID..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 h-11 rounded-md border border-slate-300 bg-white text-sm focus:border-teal-500 outline-none transition-all" 
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select 
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="flex-1 sm:flex-none px-4 h-11 rounded-md border border-slate-300 bg-white text-sm font-semibold outline-none focus:border-teal-500 transition-all"
          >
            <option>All Grades</option>
            <option>Grade 9</option>
            <option>Grade 10</option>
            <option>Grade 11</option>
            <option>Grade 12</option>
          </select>
          <select 
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="flex-1 sm:flex-none px-4 h-11 rounded-md border border-slate-300 bg-white text-sm font-semibold outline-none focus:border-teal-500 transition-all"
          >
            <option>All Modules</option>
            {uniqueModules.map((mod, i) => (
              <option key={i} value={mod}>{mod}</option>
            ))}
          </select>
          <button 
            onClick={() => {
              setSearchQuery('');
              setGradeFilter('All Grades');
              setModuleFilter('All Modules');
            }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-all"
          >
            <X size={18} /> Reset
          </button>
        </div>
      </div>

      {isLoadingStudents && students.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-center justify-center gap-3 text-slate-500 text-sm font-semibold">
          <div className="w-5 h-5 border-2 border-teal-600/30 border-t-teal-600 rounded-full animate-spin" />
          Loading students...
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-500 text-sm">
          {students.length === 0 ? 'No students yet. Use "Add Student" to register the first one.' : 'No students match your filters.'}
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {filteredStudents.map((s, i) => (
            <div 
              key={s.id || i} 
              onClick={() => onViewStudent(s)}
              className="bg-white rounded-xl p-6 border border-slate-200 card-hover relative group cursor-pointer"
            >
              {renderStudentMenu(s, `absolute top-4 right-4 ${menuStudentId === s.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`)}
              
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-4">
                  <div className="w-20 h-20 rounded-xl bg-teal-600 flex items-center justify-center text-2xl font-bold text-white">
                    {s.avatar}
                  </div>
                  <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-lg border-4 border-white flex items-center justify-center ${
                    s.status === 'excelling' ? 'bg-emerald-500' : s.status === 'on track' ? 'bg-blue-500' : 'bg-red-500'
                  }`}>
                    <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-slate-900 leading-tight">{s.name}</h3>
                <p className="text-xs font-semibold text-slate-500 mt-1">{s.grade} • ID:{s.id}</p>
                
                <div className="mt-3 flex items-center justify-center">
                  <span className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100 flex items-center gap-1.5 tracking-wide">
                    <Zap size={10} className="fill-indigo-700" />
                    Affinity: {s.affinitySubject || 'N/A'}
                  </span>
                </div>
                
                <div className="w-full mt-4 space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold text-slate-500">
                      <span>Course Progress</span>
                      <span className="text-teal-700">{s.progress ?? 0}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-600" style={{ width: `${s.progress ?? 0}%` }}></div>
                    </div>
                  </div>

                  <div className="flex gap-2 justify-center">
                    {(s.subjects || []).slice(0, 3).map((sub, idx) => (
                      <div key={idx} className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-100 text-xs font-bold text-slate-600">
                        {sub.score}%
                      </div>
                    ))}
                  </div>

                    <div className="grid grid-cols-2 gap-2 pt-4 border-t border-slate-50">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setStudentForCredentials(s as any);
                          setIsCredentialsModalOpen(true);
                        }}
                        className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-50 text-amber-800 text-xs font-bold hover:bg-amber-100 transition-colors border border-amber-200/60"
                        title="View Student Account Details"
                      >
                        <Key size={12} /> Credentials
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenCommitModal(s);
                        }}
                        className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-teal-50 border border-teal-100 text-teal-700 text-xs font-bold hover:bg-teal-100 transition-colors"
                      >
                        <BookOpen size={12} /> Commit Courses
                      </button>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewStudent(s);
                      }}
                      className="w-full mt-2 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <Eye size={12} /> View Full Profile
                    </button>
                  </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left min-w-[1000px]">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wide">Student</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wide">Grade</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wide">Affinity</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wide">Progress</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wide">Avg Score</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wide text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredStudents.map((s, i) => (
                  <tr key={s.id || i} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-sm font-bold text-white">
                          {s.avatar}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{s.name}</p>
                          <p className="text-xs text-slate-500">{s.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-slate-600">{s.grade}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100 flex items-center gap-1.5 tracking-wide">
                        <Zap size={10} className="fill-indigo-700" />
                        {s.affinitySubject || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-teal-600" style={{ width: `${s.progress ?? 0}%` }}></div>
                        </div>
                        <span className="text-xs font-bold text-slate-700">{s.progress ?? 0}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <Award size={14} className="text-amber-500" />
                        <span className="text-sm font-bold text-slate-700">{s.avgScore ?? 0}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-lg text-xs font-bold   ${
                        s.status === 'excelling' ? 'bg-emerald-50 text-emerald-600' : 
                        s.status === 'on track' ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => {
                            setStudentForCredentials(s as any);
                            setIsCredentialsModalOpen(true);
                          }}
                          className="px-2.5 py-1.5 bg-amber-50 text-amber-800 hover:bg-amber-100 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all border border-amber-200/60"
                          title="View Student Login Credentials"
                        >
                          <Key size={13} />
                          Credentials
                        </button>
                        <button 
                          onClick={() => handleOpenCommitModal(s)}
                          className="px-2.5 py-1.5 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all border border-teal-100"
                          title="Commit & Assign Courses"
                        >
                          <BookOpen size={14} />
                          Commit Courses
                        </button>
                        <button 
                          onClick={() => onViewStudent(s)}
                          className="p-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-all"
                          title="View Profile"
                        >
                          <Eye size={16} />
                        </button>
                        <button 
                          onClick={() => onViewDeepAnalytics?.(s)}
                          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                          title="Deep Analytics"
                        >
                          <TrendingUp size={16} />
                        </button>
                        <button 
                          onClick={() => {
                            setSelectedStudent(s as any);
                            setIsMessageModalOpen(true);
                          }}
                          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        >
                          <Mail size={16} />
                        </button>
                        {renderStudentMenu(s, 'relative')}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Messaging Modal */}
      {isMessageModalOpen && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => !isSending && setIsMessageModalOpen(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl overflow-hidden animate-slide-up">
            <div className="p-6 bg-white text-slate-900 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center border border-teal-100">
                  <Mail size={20} className="text-teal-700" />
                </div>
                <div>
                  <h3 className="font-bold">Message Student</h3>
                  <p className="text-xs text-teal-700 font-bold">To: {selectedStudent.name}</p>
                </div>
              </div>
              <button onClick={() => setIsMessageModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {sendSuccess ? (
                <div className="py-12 text-center space-y-4 animate-in fade-in zoom-in">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 size={32} />
                  </div>
                  <h4 className="text-xl font-bold text-slate-900">Message Sent!</h4>
                  <p className="text-slate-500">Your message has been delivered to {selectedStudent.name}.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Your Message</label>
                    <textarea 
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type your message here..."
                      className="w-full h-40 p-4 bg-white border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none"
                    />
                  </div>
                  <button 
                    onClick={handleSendMessage}
                    disabled={!message.trim() || isSending}
                    className="w-full py-4 bg-teal-600 text-white rounded-md font-bold hover:bg-teal-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {isSending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send size={18} />
                        Send Message
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      <AnimatePresence>
        {isAddStudentModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSubmitting && setIsAddStudentModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-xl shadow-xl overflow-hidden"
            >
              <div className="p-6 sm:p-6">
                {showSuccess && createdCredentials ? (
                  <div className="py-4 space-y-6 animate-in fade-in zoom-in">
                    <div className="text-center space-y-2">
                      <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                        <CheckCircle2 size={36} />
                      </div>
                      <h2 className="text-2xl font-bold text-slate-900">Student Account Created!</h2>
                      <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
                        Student profile and authentication credentials for <strong className="text-slate-800">{createdCredentials.name}</strong> have been created. This password is shown only once; copy it now and share it with the student.
                      </p>
                    </div>

                    {/* Generated Credentials Output Box */}
                    <div className="p-5 bg-white text-slate-800 rounded-xl border border-slate-200 space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                        <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                          <Key size={14} /> Official Login Credentials
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-xs font-bold">
                          Shown Once
                        </span>
                      </div>

                      <div className="space-y-2 text-xs font-mono">
                        <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                          <span className="text-slate-600">Student ID:</span>
                          <span className="text-teal-700 font-bold">{createdCredentials.studentId}</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                          <span className="text-slate-600">Login Email:</span>
                          <span className="text-slate-900 font-bold">{createdCredentials.email}</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                          <span className="text-slate-600">Student Password:</span>
                          <span className="text-amber-800 font-bold">{createdCredentials.password}</span>
                        </div>
                      </div>

                      <div>
                        <span className="text-xs text-slate-600 block mb-1">
                          Enrolled Courses ({createdCredentials.courses.length}):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {createdCredentials.courses.map((c, idx) => (
                            <span key={idx} className="px-2 py-0.5 bg-slate-50 text-teal-700 rounded-lg text-xs font-sans font-semibold border border-slate-200">
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const credText = `Enara Student Credentials\nName: ${createdCredentials.name}\nEmail: ${createdCredentials.email}\nPassword: ${createdCredentials.password}\nStudent ID: ${createdCredentials.studentId}\nRegistered Courses: ${createdCredentials.courses.join(', ')}`;
                          navigator.clipboard.writeText(credText);
                          setCopiedNewStudentCredentials(true);
                          setTimeout(() => setCopiedNewStudentCredentials(false), 2000);
                        }}
                        className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all"
                      >
                        {copiedNewStudentCredentials ? (
                          <>
                            <Check size={16} /> Credentials Copied to Clipboard!
                          </>
                        ) : (
                          <>
                            <Copy size={16} /> Copy Credentials & Details
                          </>
                        )}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsAddStudentModalOpen(false);
                        setShowSuccess(false);
                        setCreatedCredentials(null);
                        setNewStudent(emptyNewStudent());
                        setShowPassword(false);
                        setSelectedCourseIdsForNewStudent([]);
                      }}
                      className="w-full py-3.5 bg-teal-600 text-white hover:bg-teal-700 font-bold rounded-xl text-sm transition-all"
                    >
                      Done & Close
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start mb-8">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-2xl font-bold text-slate-900">Register Student & Credentials</h2>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-xs font-bold flex items-center gap-1">
                            <Database size={10} /> Live
                          </span>
                        </div>
                        <p className="text-slate-500 mt-1">Create the student record and login account, and assign course instances.</p>
                      </div>
                      <button 
                        onClick={() => setIsAddStudentModalOpen(false)}
                        className="p-2 text-slate-500 hover:text-slate-600 transition-colors"
                      >
                        <X size={24} />
                      </button>
                    </div>

                    <form onSubmit={handleAddStudent} className="space-y-5">
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Full Name</label>
                        <div className="relative">
                          <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                          <input 
                            required
                            type="text"
                            value={newStudent.name}
                            onChange={(e) => setNewStudent({...newStudent, name: e.target.value})}
                            placeholder="e.g. Sarah Ahmed"
                            className="w-full pl-12 pr-4 h-11.5 bg-white border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email Address</label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                          <input 
                            required
                            type="email"
                            value={newStudent.email}
                            onChange={(e) => setNewStudent({...newStudent, email: e.target.value})}
                            placeholder="student@school.edu"
                            className="w-full pl-12 pr-4 h-11.5 bg-white border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
                          />
                        </div>
                      </div>

                      {/* Password Generation Field */}
                      <div className="space-y-2 p-4 bg-slate-50 rounded-xl border border-slate-200/80">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                            <Lock size={12} className="text-teal-600" /> Student Password Credentials
                          </label>
                          <button
                            type="button"
                            onClick={() => setNewStudent({ ...newStudent, password: generateSecurePassword() })}
                            className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1 transition-colors"
                          >
                            <Sparkles size={12} /> Auto-Generate
                          </button>
                        </div>
                        <div className="relative">
                          <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                          <input 
                            required
                            type={showPassword ? 'text' : 'password'}
                            value={newStudent.password}
                            onChange={(e) => setNewStudent({...newStudent, password: e.target.value})}
                            placeholder="Initial login password"
                            className="w-full pl-12 pr-12 h-11 bg-white border border-slate-300 rounded-md text-sm font-mono outline-none focus:border-teal-500 transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 leading-normal">
                          Used to create the student's login. It is stored hashed and shown only once after creation (minimum 8 characters).
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-6">
                        <div className="space-y-2">
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Grade Level</label>
                          <div className="relative">
                            <GraduationCap className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <select 
                              value={newStudent.grade}
                              onChange={(e) => setNewStudent({...newStudent, grade: e.target.value})}
                              className="w-full pl-12 pr-4 h-11.5 bg-white border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-teal-500/20 transition-all appearance-none"
                            >
                              <option>Grade 9</option>
                              <option>Grade 10</option>
                              <option>Grade 11</option>
                              <option>Grade 12</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Course Commitment Selection */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 ml-1 flex items-center justify-between">
                          <span>Commit & Register Courses</span>
                          <span className="text-teal-600 font-bold">{selectedCourseIdsForNewStudent.length} Selected</span>
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1">
                          {isLoadingCourses ? (
                            <div className="col-span-full p-3 text-xs text-slate-500">Loading course instances...</div>
                          ) : courseInstances.length === 0 ? (
                            <div className="col-span-full p-3 text-xs text-slate-500">No course instances available.</div>
                          ) : courseInstances.map(course => {
                            const isSelected = selectedCourseIdsForNewStudent.includes(course.id);
                            return (
                              <div 
                                key={course.id}
                                onClick={() => toggleNewStudentCourse(course.id)}
                                className={`p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all flex items-center justify-between ${
                                  isSelected 
                                    ? 'bg-teal-50 border-teal-500 text-teal-900 shadow-sm' 
                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                <div>
                                  <div className="font-bold">{courseLabel(course)}</div>
                                  <div className="text-xs text-slate-500">{[course.academicYear, course.batchId].filter(Boolean).join(' • ')}</div>
                                </div>
                                <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                                  isSelected ? 'bg-teal-600 text-white' : 'bg-slate-200 text-transparent'
                                }`}>
                                  <Check size={12} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="pt-4 flex gap-4">
                        <button 
                          type="button"
                          onClick={() => setIsAddStudentModalOpen(false)}
                          className="flex-1 py-4 text-slate-500 font-bold hover:text-slate-700 transition-all"
                        >
                          Cancel
                        </button>
                        <button 
                          type="submit"
                          disabled={isSubmitting}
                          className="flex-[2] py-4 bg-teal-600 text-white rounded-md font-bold hover:bg-teal-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isSubmitting ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Creating Account...
                            </>
                          ) : (
                            'Create Student & Login'
                          )}
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Administrator Commit Courses Modal */}
      <AnimatePresence>
        {isCommitModalOpen && studentToCommit && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSubmittingCommit && setIsCommitModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-white rounded-xl shadow-xl overflow-hidden border border-slate-200"
            >
              <div className="p-6 sm:p-6">
                {commitSuccess ? (
                  <div className="py-10 text-center space-y-4">
                    <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 size={40} />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900">Courses Successfully Committed!</h3>
                    <p className="text-slate-500 text-sm">
                      {studentToCommit.name} is now enrolled in {committingCourseIds.length} course instance(s).
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-2xl font-bold text-slate-900">Commit Courses for Student</h3>
                          <span className="px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 text-xs font-bold flex items-center gap-1">
                            <Database size={10} /> Enrollment
                          </span>
                        </div>
                        <p className="text-slate-500 text-sm mt-1">
                          Select and register default courses for <strong className="text-slate-800">{studentToCommit.name}</strong> ({studentToCommit.email}).
                        </p>
                      </div>
                      <button 
                        onClick={() => setIsCommitModalOpen(false)}
                        className="p-2 text-slate-500 hover:text-slate-600 transition-colors"
                      >
                        <X size={20} />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div className="p-4 bg-teal-50/70 rounded-xl border border-teal-100/80 flex items-start gap-3">
                        <BookOpen size={20} className="text-teal-600 shrink-0 mt-0.5" />
                        <div className="text-xs text-teal-900">
                          <strong>Administrator Access Privilege:</strong> Selecting a course instance enrolls the student in it; deselecting removes the enrollment.
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                          <span>Available Institutional Curriculum</span>
                          <span className="text-teal-700">{committingCourseIds.length} Selected</span>
                        </div>

                        <div className="grid grid-cols-1 gap-2.5 max-h-64 overflow-y-auto pr-1">
                          {isLoadingCourses ? (
                            <div className="p-4 text-xs text-slate-500">Loading course instances...</div>
                          ) : courseInstances.length === 0 ? (
                            <div className="p-4 text-xs text-slate-500">No course instances available.</div>
                          ) : courseInstances.map(course => {
                            const isChecked = committingCourseIds.includes(course.id);
                            return (
                              <div 
                                key={course.id}
                                onClick={() => toggleCommitCourse(course.id)}
                                className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                                  isChecked 
                                    ? 'bg-teal-50 border-teal-500 text-teal-950 shadow-sm' 
                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                <div className="space-y-0.5">
                                  <div className="font-bold text-sm flex items-center gap-2">
                                    <span>{courseLabel(course)}</span>
                                    <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-xs">
                                      {course.courseId}
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {[course.academicYear, course.batchId].filter(Boolean).join(' • ') || course.id} • {(course.studentIds || []).length} Students
                                  </div>
                                </div>
                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                                  isChecked ? 'bg-teal-600 text-white' : 'bg-slate-200 text-transparent'
                                }`}>
                                  <Check size={14} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="pt-4 flex gap-4">
                        <button 
                          type="button"
                          onClick={() => setIsCommitModalOpen(false)}
                          className="flex-1 py-3.5 text-slate-500 font-bold hover:text-slate-700 transition-all text-sm"
                        >
                          Cancel
                        </button>
                        <button 
                          type="button"
                          onClick={handleSaveCommitCourses}
                          disabled={isSubmittingCommit || isLoadingCourses}
                          className="flex-[2] py-3.5 bg-teal-600 text-white rounded-md font-bold hover:bg-teal-700 transition-all disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                        >
                          {isSubmittingCommit ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Saving Enrollment...
                            </>
                          ) : (
                            <>
                              <Database size={16} />
                              Save Enrollment
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Administrator View Credentials Modal */}
      <AnimatePresence>
        {isCredentialsModalOpen && studentForCredentials && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCredentialsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white text-slate-900 rounded-xl shadow-xl overflow-hidden border border-slate-200 p-6 sm:p-6 space-y-6"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 text-xs font-bold flex items-center gap-1">
                      <Key size={10} /> Administrator Access
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-bold flex items-center gap-1">
                      <Database size={10} /> Student Record
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mt-2">Student Account Details</h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Student account and course access details for <strong className="text-teal-700">{studentForCredentials.name}</strong>.
                  </p>
                </div>
                <button 
                  onClick={() => setIsCredentialsModalOpen(false)}
                  className="p-2 text-slate-600 hover:text-slate-800 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Credentials Details */}
              <div className="space-y-3 font-mono text-xs">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
                  <span className="text-slate-600">Student ID:</span>
                  <span className="text-teal-700 font-bold">{studentForCredentials.id}</span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
                  <span className="text-slate-600">Login Email:</span>
                  <span className="text-slate-900 font-bold">{studentForCredentials.email}</span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center gap-4">
                  <span className="text-slate-600">Student Password:</span>
                  <span className="text-slate-600 font-sans text-xs text-right">
                    Not stored in readable form. It was shown once when the account was created.
                  </span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <span className="text-slate-600 block font-sans text-xs">
                    Committed Courses & Enrollment:
                  </span>
                  <div className="flex flex-wrap gap-1.5 font-sans">
                    {enrolledInstances(studentForCredentials.id).length > 0 ? (
                      enrolledInstances(studentForCredentials.id).map(c => (
                        <span key={c.id} className="px-2.5 py-1 bg-teal-50 text-teal-700 border border-teal-100 rounded-xl text-xs font-semibold">
                          {courseLabel(c)}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-600">{isLoadingCourses ? 'Loading...' : 'Not enrolled in any course instance.'}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const credText = `Enara Student Account\nName: ${studentForCredentials.name}\nEmail: ${studentForCredentials.email}\nStudent ID: ${studentForCredentials.id}`;
                    navigator.clipboard.writeText(credText);
                    setCopiedCredModal(true);
                    setTimeout(() => setCopiedCredModal(false), 2000);
                  }}
                  className="w-full py-3.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all"
                >
                  {copiedCredModal ? (
                    <>
                      <Check size={16} /> Credentials Copied to Clipboard!
                    </>
                  ) : (
                    <>
                      <Copy size={16} /> Copy Account Details
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setIsCredentialsModalOpen(false)}
                  className="w-full py-3 text-slate-600 hover:text-slate-800 font-bold text-xs transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Student Modal */}
      <AnimatePresence>
        {studentToEdit && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSavingEdit && setStudentToEdit(null)}
              className="absolute inset-0 bg-slate-900/60"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-xl shadow-xl overflow-hidden p-6 sm:p-6"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Edit Student</h2>
                  <p className="text-slate-500 mt-1 text-sm">ID: {studentToEdit.id}</p>
                </div>
                <button onClick={() => setStudentToEdit(null)} className="p-2 text-slate-500 hover:text-slate-600 transition-colors">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleSaveEdit} className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Full Name</label>
                  <input
                    required
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-4 h-11.5 bg-white border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email Address</label>
                  <input
                    required
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-4 h-11.5 bg-white border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
                  />
                  <p className="text-xs text-slate-500 ml-1">Changing the email does not change the student's login email.</p>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Grade Level</label>
                  <select
                    value={editForm.grade}
                    onChange={(e) => setEditForm({ ...editForm, grade: e.target.value })}
                    className="w-full px-4 h-11.5 bg-white border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-teal-500/20 transition-all appearance-none"
                  >
                    {Array.from(new Set(['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12', editForm.grade])).filter(Boolean).map(g => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div className="pt-4 flex gap-4">
                  <button
                    type="button"
                    onClick={() => setStudentToEdit(null)}
                    className="flex-1 py-4 text-slate-500 font-bold hover:text-slate-700 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="flex-[2] py-4 bg-teal-600 text-white rounded-md font-bold hover:bg-teal-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSavingEdit ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
