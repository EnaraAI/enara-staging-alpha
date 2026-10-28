import React, { useState, useEffect } from 'react';
import {
  Activity,
  Terminal,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  RefreshCw,
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  Layers,
  Database,
  Cpu,
  Trash2,
  Download,
  Info,
  Key,
  MessageSquare,
  FileText,
  Search,
  ExternalLink,
  Code
} from 'lucide-react';
import {
  runTutorDiagnosticCycle,
  getDiagnosticLogs,
  subscribeDiagnosticLogs,
  clearDiagnosticLogs,
  DiagnosticLogCycle
} from '../services/tutorDiagnostic';

export const TutorDiagnosticUtility: React.FC = () => {
  const [logs, setLogs] = useState<DiagnosticLogCycle[]>(getDiagnosticLogs());
  const [selectedLog, setSelectedLog] = useState<DiagnosticLogCycle | null>(logs[0] || null);

  // Runner state
  const [promptInput, setPromptInput] = useState('Teach me about this course');
  const [contextInput, setContextInput] = useState('Intro to Computer Science');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentPassword, setStudentPassword] = useState('');
  const [customToken, setCustomToken] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Inspector View Tab
  const [inspectorTab, setInspectorTab] = useState<'analysis' | 'step1' | 'step2' | 'raw_json'>('analysis');

  useEffect(() => {
    const unsubscribe = subscribeDiagnosticLogs((updatedLogs) => {
      setLogs(updatedLogs);
      if (!selectedLog && updatedLogs.length > 0) {
        setSelectedLog(updatedLogs[0]);
      }
    });
    return () => unsubscribe();
  }, [selectedLog]);

  const handleRunDiagnostic = async () => {
    setIsRunning(true);
    try {
      const cycle = await runTutorDiagnosticCycle(promptInput, contextInput, {
        email: studentEmail || undefined,
        password: studentPassword || undefined,
        token: customToken || undefined,
      });
      setSelectedLog(cycle);
    } catch (err) {
      console.error("Diagnostic execution error:", err);
    } finally {
      setIsRunning(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const exportLogsAsJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `enara-tutor-diagnostic-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto p-2 sm:p-4">
      {/* Utility Header */}
      <div className="bg-slate-900 text-white p-6 sm:p-8 rounded-3xl shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="px-3 py-1 rounded-full bg-teal-400/20 text-teal-300 border border-teal-400/30 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Activity size={14} className="animate-pulse" /> Diagnostic Engine
              </span>
              <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-mono">
                /api/me/tutor/sessions
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Enara AI Tutor Request/Response Cycle Inspector
            </h1>
            <p className="text-slate-400 text-sm mt-1 max-w-2xl">
              Inspect full HTTP request payloads, header metadata, response latency, and root-cause analysis for rigid or fallback Socratic tutor responses.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={exportLogsAsJson}
              disabled={logs.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all disabled:opacity-50 border border-slate-700"
            >
              <Download size={14} /> Export Logs
            </button>
            <button
              onClick={() => clearDiagnosticLogs()}
              disabled={logs.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold transition-all disabled:opacity-50 border border-red-500/20"
            >
              <Trash2 size={14} /> Clear History
            </button>
          </div>
        </div>
      </div>

      {/* Grid Container: Runner Panel & Inspector Panel */}
      <div className="grid lg:grid-cols-12 gap-8">
        {/* Left Column: Test Execution Panel (4 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
                  <Terminal size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Run Diagnostic Cycle</h3>
                  <p className="text-[11px] text-slate-500">Execute test HTTP call sequence</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  User Prompt / Question
                </label>
                <input
                  type="text"
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="e.g. Teach me about this course"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-teal-500 focus:bg-white outline-none transition-all font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Lesson Context (Optional)
                </label>
                <input
                  type="text"
                  value={contextInput}
                  onChange={(e) => setContextInput(e.target.value)}
                  placeholder="e.g. Intro to Computer Science"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-teal-500 focus:bg-white outline-none transition-all font-medium"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Student Account
                </label>
                <p className="text-[11px] text-slate-500">The tutor API only serves students, so the test signs in as one. Nothing is saved.</p>
                <input
                  type="email"
                  value={studentEmail}
                  onChange={(e) => setStudentEmail(e.target.value)}
                  placeholder="student@school.edu"
                  autoComplete="off"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:ring-2 focus:ring-teal-500 focus:bg-white outline-none transition-all"
                />
                <input
                  type="password"
                  value={studentPassword}
                  onChange={(e) => setStudentPassword(e.target.value)}
                  placeholder="Student password"
                  autoComplete="new-password"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:ring-2 focus:ring-teal-500 focus:bg-white outline-none transition-all"
                />
                <div className="relative">
                  <input
                    type="password"
                    value={customToken}
                    onChange={(e) => setCustomToken(e.target.value)}
                    placeholder="Or paste a student access token"
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono focus:ring-2 focus:ring-teal-500 focus:bg-white outline-none transition-all"
                  />
                  <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Quick Presets
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => { setPromptInput("Teach me"); setContextInput("Data Structures"); }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors"
                  >
                    "Teach me"
                  </button>
                  <button
                    onClick={() => { setPromptInput("What's this course about"); setContextInput("AP Physics"); }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors"
                  >
                    "Course About"
                  </button>
                  <button
                    onClick={() => { setPromptInput("What is 2+2?"); setContextInput("Calculus 101"); }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors"
                  >
                    "What is 2+2?"
                  </button>
                </div>
              </div>

              <button
                onClick={handleRunDiagnostic}
                disabled={isRunning || !promptInput.trim()}
                className="w-full py-4 bg-teal-900 text-white rounded-2xl font-bold text-sm shadow-lg shadow-teal-900/10 hover:bg-teal-800 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isRunning ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" /> Executing Cycle...
                  </>
                ) : (
                  <>
                    <Play size={16} className="fill-current" /> Run Request Cycle Diagnostic
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Diagnostic Log History List */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Clock size={16} className="text-teal-600" /> Recent Diagnostic Logs ({logs.length})
              </h3>
            </div>

            {logs.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No diagnostic runs executed yet. Click "Run Request Cycle Diagnostic" above.
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {logs.map((log) => {
                  const isSelected = selectedLog?.id === log.id;
                  const isRigid = log.rigidAnalysis.isRigidResponse;

                  return (
                    <button
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all ${
                        isSelected
                          ? 'border-teal-500 bg-teal-50/40 shadow-sm'
                          : 'border-slate-100 hover:border-slate-200 bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {isRigid ? (
                            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-200">
                              Rigid Fallback
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                              Dynamic AI
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-slate-500">
                          {log.totalDurationMs}ms
                        </span>
                      </div>

                      <p className="text-xs font-bold text-slate-800 truncate">
                        "{log.prompt}"
                      </p>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-1">
                        <span>HTTP {log.step1_sessionCreation.responseStatus}</span>
                        {log.rigidAnalysis.intent && <span>intent: {log.rigidAnalysis.intent}</span>}
                        {log.rigidAnalysis.contextFound !== undefined && (
                          <span>ctxFound: {log.rigidAnalysis.contextFound}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Full Inspector & Diagnostics (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {!selectedLog ? (
            <div className="bg-white rounded-3xl p-12 text-center text-slate-400 border border-slate-200/80">
              <Info size={32} className="mx-auto mb-3 text-slate-300" />
              <p className="font-bold text-slate-700">No Request Selected</p>
              <p className="text-xs mt-1">Run a diagnostic test or select a log from the left panel.</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 overflow-hidden">
              {/* Log Details Header Bar */}
              <div className="p-6 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-teal-400">ID: {selectedLog.id}</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-xs text-slate-400">
                      {new Date(selectedLog.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-white truncate max-w-md">
                    Prompt: "{selectedLog.prompt}"
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <div className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300">
                    Duration: <span className="text-teal-400 font-bold">{selectedLog.totalDurationMs}ms</span>
                  </div>
                </div>
              </div>

              {/* Inspector View Navigation Tabs */}
              <div className="bg-slate-100 p-2 border-b border-slate-200 flex gap-2 overflow-x-auto text-xs font-bold">
                <button
                  onClick={() => setInspectorTab('analysis')}
                  className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
                    inspectorTab === 'analysis'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Activity size={14} /> Rigidness Analysis
                </button>
                <button
                  onClick={() => setInspectorTab('step1')}
                  className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
                    inspectorTab === 'step1'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Layers size={14} /> Step 1: /sessions
                </button>
                <button
                  onClick={() => setInspectorTab('step2')}
                  className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
                    inspectorTab === 'step2'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <MessageSquare size={14} /> Step 2: /messages
                </button>
                <button
                  onClick={() => setInspectorTab('raw_json')}
                  className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
                    inspectorTab === 'raw_json'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Code size={14} /> Raw JSON
                </button>
              </div>

              {/* TAB 1: Diagnostic Analysis Summary */}
              {inspectorTab === 'analysis' && (
                <div className="p-6 space-y-6">
                  {/* Status Banner */}
                  <div className={`p-5 rounded-2xl border ${
                    selectedLog.rigidAnalysis.isRigidResponse
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  }`}>
                    <div className="flex items-start gap-3">
                      {selectedLog.rigidAnalysis.isRigidResponse ? (
                        <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <h4 className="font-bold text-sm mb-1">
                          {selectedLog.rigidAnalysis.isRigidResponse
                            ? "Rigid / Template Fallback Response Detected"
                            : "Dynamic AI Response Generated Successfully"}
                        </h4>
                        <p className="text-xs leading-relaxed opacity-90">
                          {selectedLog.rigidAnalysis.rigidReason}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Metadata Matrix */}
                  <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Intent</span>
                      <p className="font-mono text-sm font-bold text-slate-800 mt-0.5">
                        {selectedLog.rigidAnalysis.intent || 'N/A'}
                      </p>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Context Found</span>
                      <p className="font-mono text-sm font-bold text-slate-800 mt-0.5">
                        {selectedLog.rigidAnalysis.contextFound !== undefined ? selectedLog.rigidAnalysis.contextFound : 'N/A'}
                      </p>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Engine Version</span>
                      <p className="font-mono text-sm font-bold text-slate-800 mt-0.5">
                        {selectedLog.rigidAnalysis.version || 'N/A'}
                      </p>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Teaching Method</span>
                      <p className="font-mono text-sm font-bold text-slate-800 mt-0.5">
                        {selectedLog.rigidAnalysis.teachingMethod || 'socratic'}
                      </p>
                    </div>
                  </div>

                  {/* Indicators List */}
                  {selectedLog.rigidAnalysis.indicators.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Diagnostic Indicators Triggered
                      </h4>
                      <div className="space-y-1.5">
                        {selectedLog.rigidAnalysis.indicators.map((ind, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50/60 p-2.5 rounded-xl border border-amber-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                            <span>{ind}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Remediation & Recommendations */}
                  {selectedLog.rigidAnalysis.recommendations.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Remediation & Integration Steps
                      </h4>
                      <div className="space-y-2">
                        {selectedLog.rigidAnalysis.recommendations.map((rec, i) => (
                          <div key={i} className="flex items-start gap-2.5 text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
                            <CheckCircle2 size={16} className="text-teal-600 shrink-0 mt-0.5" />
                            <span>{rec}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: Step 1 Session Creation Request/Response */}
              {inspectorTab === 'step1' && (
                <div className="p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">
                        Step 1: Session Initialization
                      </h3>
                      <p className="text-xs font-mono text-slate-500">
                        {selectedLog.step1_sessionCreation.method} {selectedLog.step1_sessionCreation.endpoint}
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${
                      selectedLog.step1_sessionCreation.responseStatus < 300
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      HTTP {selectedLog.step1_sessionCreation.responseStatus} ({selectedLog.step1_sessionCreation.durationMs}ms)
                    </span>
                  </div>

                  {/* Request Headers & Body */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Request Body
                      </span>
                      <button
                        onClick={() => copyToClipboard(JSON.stringify(selectedLog.step1_sessionCreation.requestBody, null, 2), 'step1_req')}
                        className="text-[11px] text-teal-700 font-bold hover:underline flex items-center gap-1"
                      >
                        {copiedKey === 'step1_req' ? <Check size={12} /> : <Copy size={12} />} Copy JSON
                      </button>
                    </div>
                    <pre className="p-4 rounded-2xl bg-slate-900 text-teal-300 font-mono text-xs overflow-x-auto">
                      {JSON.stringify(selectedLog.step1_sessionCreation.requestBody, null, 2)}
                    </pre>
                  </div>

                  {/* Response Body */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Response Body
                      </span>
                      <button
                        onClick={() => copyToClipboard(JSON.stringify(selectedLog.step1_sessionCreation.responseBody, null, 2), 'step1_res')}
                        className="text-[11px] text-teal-700 font-bold hover:underline flex items-center gap-1"
                      >
                        {copiedKey === 'step1_res' ? <Check size={12} /> : <Copy size={12} />} Copy JSON
                      </button>
                    </div>
                    <pre className="p-4 rounded-2xl bg-slate-900 text-amber-300 font-mono text-xs overflow-x-auto">
                      {JSON.stringify(selectedLog.step1_sessionCreation.responseBody, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* TAB 3: Step 2 Message Send Request/Response */}
              {inspectorTab === 'step2' && (
                <div className="p-6 space-y-6">
                  {!selectedLog.step2_messageSend ? (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      Step 2 was skipped because session creation did not return a valid session ID.
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-slate-900 text-sm">
                            Step 2: Post Socratic Message
                          </h3>
                          <p className="text-xs font-mono text-slate-500">
                            {selectedLog.step2_messageSend.method} {selectedLog.step2_messageSend.endpoint}
                          </p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${
                          selectedLog.step2_messageSend.responseStatus < 300
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          HTTP {selectedLog.step2_messageSend.responseStatus} ({selectedLog.step2_messageSend.durationMs}ms)
                        </span>
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                            Request Payload
                          </span>
                          <button
                            onClick={() => copyToClipboard(JSON.stringify(selectedLog.step2_messageSend?.requestBody, null, 2), 'step2_req')}
                            className="text-[11px] text-teal-700 font-bold hover:underline flex items-center gap-1"
                          >
                            {copiedKey === 'step2_req' ? <Check size={12} /> : <Copy size={12} />} Copy JSON
                          </button>
                        </div>
                        <pre className="p-4 rounded-2xl bg-slate-900 text-teal-300 font-mono text-xs overflow-x-auto">
                          {JSON.stringify(selectedLog.step2_messageSend.requestBody, null, 2)}
                        </pre>
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                            Response Payload
                          </span>
                          <button
                            onClick={() => copyToClipboard(JSON.stringify(selectedLog.step2_messageSend?.responseBody, null, 2), 'step2_res')}
                            className="text-[11px] text-teal-700 font-bold hover:underline flex items-center gap-1"
                          >
                            {copiedKey === 'step2_res' ? <Check size={12} /> : <Copy size={12} />} Copy JSON
                          </button>
                        </div>
                        <pre className="p-4 rounded-2xl bg-slate-900 text-amber-300 font-mono text-xs overflow-x-auto">
                          {JSON.stringify(selectedLog.step2_messageSend.responseBody, null, 2)}
                        </pre>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* TAB 4: Raw JSON Export View */}
              {inspectorTab === 'raw_json' && (
                <div className="p-6 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Full Diagnostic Log Cycle Payload
                    </span>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(selectedLog, null, 2), 'raw_full')}
                      className="text-[11px] text-teal-700 font-bold hover:underline flex items-center gap-1"
                    >
                      {copiedKey === 'raw_full' ? <Check size={12} /> : <Copy size={12} />} Copy Full JSON
                    </button>
                  </div>
                  <pre className="p-5 rounded-2xl bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto max-h-[500px]">
                    {JSON.stringify(selectedLog, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
