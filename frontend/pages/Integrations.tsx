import React, { useCallback, useEffect, useState } from 'react';
import { 
  Key, 
  ShieldCheck, 
  AlertTriangle as ShieldAlert, 
  User, 
  Building2, 
  CheckCircle2, 
  Loader2,
  Lock,
  RefreshCw,
  PlusCircle,
  Phone,
  Mail,
  UserPlus,
  Copy,
  Check,
  ChevronDown,
  Cpu,
  Code,
  Terminal,
  Layers,
  Send,
  Workflow,
  Upload,
  Ban,
  Zap
} from 'lucide-react';
import { TutorDiagnosticUtility } from '@/components/TutorDiagnosticUtility';
import {
  createPartnerInstitution,
  fetchCourseInstances,
  fetchPartnerApiKeys,
  fetchPartnerInstitutions,
  issuePartnerApiKey,
  publicApiBase,
  requestAsPartner,
  revokePartnerApiKey,
  validatePartnerApiKey,
  PartnerApiKey,
  PartnerInstitution,
  PartnerOnboardingResult,
  RawApiResponse,
} from '@/services/apiService';
import { ApiKeyValidationResponse } from '@/types';

type IntegrationsTab = 'keys' | 'validate' | 'add' | 'api-integration' | 'tutor-diagnostic' | 'docs';

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message) || fallback;

const formatDate = (value?: string) => (value ? new Date(value).toLocaleString() : 'Never');

export const Integrations: React.FC = () => {
  const [activeTab, setActiveTab] = useState<IntegrationsTab>('keys');
  
  // Validation State
  const [apiKey, setApiKey] = useState('');
  const [adminId, setAdminId] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [lmsId, setLmsId] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [result, setResult] = useState<ApiKeyValidationResponse | null>(null);
  const [validateError, setValidateError] = useState<string | null>(null);

  // Creation State
  const [newInstName, setNewInstName] = useState('');
  const [newLmsSystem, setNewLmsSystem] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPhone, setNewAdminPhone] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [creationResult, setCreationResult] = useState<PartnerOnboardingResult | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Institutions & keys
  const [institutions, setInstitutions] = useState<PartnerInstitution[]>([]);
  const [apiKeys, setApiKeys] = useState<PartnerApiKey[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [busyKeyAction, setBusyKeyAction] = useState<string | null>(null);
  const [issuedKey, setIssuedKey] = useState<{ institutionName: string; key: string } | null>(null);

  // Ingestion tester
  const [courses, setCourses] = useState<Array<{ courseId: string; courseName?: string; institutionId?: string }>>([]);
  const [testCourseId, setTestCourseId] = useState('');
  const [testFile, setTestFile] = useState<File | null>(null);
  const [testApiKey, setTestApiKey] = useState('');
  const [isSendingApiRequest, setIsSendingApiRequest] = useState(false);
  const [apiTestResponse, setApiTestResponse] = useState<RawApiResponse | null>(null);
  const [statusResponse, setStatusResponse] = useState<RawApiResponse | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [activeIngestSnippet, setActiveIngestSnippet] = useState<'curl' | 'python' | 'node'>('curl');

  const apiBase = publicApiBase();

  const loadKeys = useCallback(async () => {
    setIsLoadingKeys(true);
    setKeysError(null);
    try {
      const [insts, keys] = await Promise.all([fetchPartnerInstitutions(), fetchPartnerApiKeys()]);
      setInstitutions(insts);
      setApiKeys(keys);
    } catch (err) {
      setKeysError(errorMessage(err, 'Could not load institutions and API keys'));
    } finally {
      setIsLoadingKeys(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'keys') loadKeys();
  }, [activeTab, loadKeys]);

  useEffect(() => {
    if (activeTab !== 'api-integration' || courses.length) return;
    fetchCourseInstances()
      .then(list => {
        setCourses(list);
        if (list[0]) setTestCourseId(list[0].courseId);
      })
      .catch(() => setCourses([]));
  }, [activeTab, courses.length]);

  const handleRevokeKey = async (key: PartnerApiKey) => {
    if (!window.confirm(`Revoke ${key.keyPrefix}? Systems using it will stop working immediately.`)) return;
    setBusyKeyAction(key.id);
    try {
      await revokePartnerApiKey(key.id);
      await loadKeys();
    } catch (err) {
      setKeysError(errorMessage(err, 'Could not revoke the key'));
    } finally {
      setBusyKeyAction(null);
    }
  };

  const handleIssueKey = async (inst: PartnerInstitution) => {
    setBusyKeyAction(inst.id);
    setIssuedKey(null);
    try {
      const res = await issuePartnerApiKey(inst.id);
      setIssuedKey({ institutionName: inst.name, key: res.apiKey });
      await loadKeys();
    } catch (err) {
      setKeysError(errorMessage(err, 'Could not issue a new key'));
    } finally {
      setBusyKeyAction(null);
    }
  };

  const handleExecuteApiTest = async () => {
    if (!testCourseId || !testFile) return;
    setIsSendingApiRequest(true);
    setApiTestResponse(null);
    setStatusResponse(null);
    try {
      const form = new FormData();
      form.append('file', testFile);
      setApiTestResponse(
        await requestAsPartner('POST', `/api/upload/course/${encodeURIComponent(testCourseId)}`, testApiKey, form)
      );
    } catch (err) {
      setApiTestResponse({ status: 0, ok: false, latencyMs: 0, data: { error: errorMessage(err, 'Network request failed') } });
    } finally {
      setIsSendingApiRequest(false);
    }
  };

  const uploadEventId: string | undefined = apiTestResponse?.ok ? apiTestResponse.data?.eventId : undefined;

  const handleCheckStatus = async () => {
    if (!uploadEventId) return;
    setIsCheckingStatus(true);
    try {
      setStatusResponse(await requestAsPartner('GET', `/api/ingestion/status/${encodeURIComponent(uploadEventId)}`, testApiKey));
    } catch (err) {
      setStatusResponse({ status: 0, ok: false, latencyMs: 0, data: { error: errorMessage(err, 'Network request failed') } });
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsValidating(true);
    setResult(null);
    setValidateError(null);
    
    try {
      const response = await validatePartnerApiKey({
        apiKey,
        adminIdentifier: adminId,
        institutionIdentifier: institutionId,
        lmsSystemId: lmsId || undefined
      });
      setResult(response);
    } catch (err) {
      setValidateError(errorMessage(err, 'Validation failed'));
    } finally {
      setIsValidating(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setCreationResult(null);
    setCreateError(null);

    try {
      const response = await createPartnerInstitution({
        institutionName: newInstName,
        lmsSystem: newLmsSystem || undefined,
        adminName: newAdminName,
        adminEmail: newAdminEmail,
        adminPhone: newAdminPhone || undefined
      });
      setCreationResult(response);
    } catch (err) {
      setCreateError(errorMessage(err, 'Could not create the institution'));
    } finally {
      setIsCreating(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const resetForm = () => {
    setApiKey('');
    setAdminId('');
    setInstitutionId('');
    setLmsId('');
    setResult(null);
    setValidateError(null);
    
    setNewInstName('');
    setNewLmsSystem('');
    setNewAdminName('');
    setNewAdminEmail('');
    setNewAdminPhone('');
    setCreationResult(null);
    setCreateError(null);
  };

  const exampleCourseId = testCourseId || 'YOUR_COURSE_ID';
  const curlSnippet = `curl -X POST "${apiBase}/upload/course/${exampleCourseId}" \\
  -H "Authorization: Bearer $ENARA_API_KEY" \\
  -F "file=@chapter-4.pdf"

# Response: 202 { "success": true, "eventId": "...", "ingestionId": "...", "s3Key": "..." }

curl "${apiBase}/ingestion/status/EVENT_ID" \\
  -H "Authorization: Bearer $ENARA_API_KEY"`;
  const pythonSnippet = `import os
import requests

API = "${apiBase}"
HEADERS = {"Authorization": f"Bearer {os.environ['ENARA_API_KEY']}"}

with open("chapter-4.pdf", "rb") as f:
    upload = requests.post(
        f"{API}/upload/course/${exampleCourseId}",
        headers=HEADERS,
        files={"file": ("chapter-4.pdf", f, "application/pdf")},
    )
upload.raise_for_status()
event_id = upload.json()["eventId"]

status = requests.get(f"{API}/ingestion/status/{event_id}", headers=HEADERS)
print(status.json()["data"]["status"])`;
  const nodeSnippet = `import { readFile } from "node:fs/promises";

const API = "${apiBase}";
const headers = { Authorization: \`Bearer \${process.env.ENARA_API_KEY}\` };

const form = new FormData();
form.append("file", new Blob([await readFile("chapter-4.pdf")], { type: "application/pdf" }), "chapter-4.pdf");

const upload = await fetch(\`\${API}/upload/course/${exampleCourseId}\`, { method: "POST", headers, body: form });
if (!upload.ok) throw new Error(\`Upload failed: \${upload.status}\`);
const { eventId } = await upload.json();

const status = await fetch(\`\${API}/ingestion/status/\${eventId}\`, { headers });
console.log((await status.json()).data.status);`;
  const activeSnippet = activeIngestSnippet === 'curl' ? curlSnippet : activeIngestSnippet === 'python' ? pythonSnippet : nodeSnippet;

  const tabs: Array<{ id: IntegrationsTab; label: string; icon: React.ReactNode }> = [
    { id: 'keys', label: 'Institutions & keys', icon: <Building2 size={16} /> },
    { id: 'add', label: 'Add institution', icon: <PlusCircle size={16} /> },
    { id: 'validate', label: 'Validate key', icon: <ShieldCheck size={16} /> },
    { id: 'api-integration', label: 'Ingestion API', icon: <Workflow size={16} /> },
    { id: 'tutor-diagnostic', label: 'Tutor API diagnostics', icon: <Cpu size={16} /> },
    { id: 'docs', label: 'API reference', icon: <Code size={16} /> },
  ];

  const card = 'bg-white border border-slate-200 rounded-xl p-6';
  const thRow = 'text-xs uppercase tracking-wide text-slate-500';
  const inputCls = 'w-full h-11 px-3 bg-white border border-slate-300 rounded-md text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20';
  const labelCls = 'block text-sm font-semibold text-slate-700 mb-1';
  const btnPrimary = 'inline-flex items-center justify-center gap-2 h-11 px-5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-md text-sm disabled:opacity-50';
  const btnSecondary = 'inline-flex items-center justify-center gap-2 h-11 px-4 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-semibold rounded-md text-sm disabled:opacity-50';
  const errorBox = 'p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-sm';
  const CardHeader: React.FC<{ title: string; subtitle?: React.ReactNode; action?: React.ReactNode }> = ({ title, subtitle, action }) => (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-sm text-slate-600 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
  const CopyBox: React.FC<{ value: string; field: string; label: string }> = ({ value, field, label }) => (
    <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-md">
      <span className="text-sm font-mono text-slate-900 break-all">{value}</span>
      <button
        onClick={() => copyToClipboard(value, field)}
        aria-label={`Copy ${label}`}
        title={`Copy ${label}`}
        className="p-1.5 text-slate-600 hover:text-teal-700 rounded shrink-0"
      >
        {copiedField === field ? <Check size={16} className="text-green-700" /> : <Copy size={16} />}
      </button>
    </div>
  );

  const renderResponse = (title: string, response: RawApiResponse) => (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            response.ok ? 'bg-green-50 text-green-700' : 'bg-rose-50 text-rose-700'
          }`}>
            {response.status ? `HTTP ${response.status}` : 'No response'}
          </span>
          {response.latencyMs > 0 && <span className="text-xs text-slate-600 font-mono">{response.latencyMs} ms</span>}
        </div>
        <span className="text-xs text-slate-600 font-mono">{title}</span>
      </div>
      <pre className="p-4 bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto leading-relaxed max-h-80">
        {JSON.stringify(response.data, null, 2)}
      </pre>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-teal-700">Enara executive</p>
        <h1 className="text-3xl font-extrabold text-slate-900">Partner integrations</h1>
        <p className="text-slate-600 mt-1">Onboard partner institutions, manage their API keys, and test the course ingestion API.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-slate-200 overflow-x-auto" role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`-mb-px pb-3 text-sm font-semibold whitespace-nowrap flex items-center gap-2 border-b-2 ${
              activeTab === tab.id ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'tutor-diagnostic' ? (
        <TutorDiagnosticUtility />
      ) : (
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6 min-w-0">
          {activeTab === 'keys' && (
            <div className="space-y-6">
              <div className={card}>
                <CardHeader
                  title="Partner institutions"
                  subtitle="Institutions onboarded through this page."
                  action={
                    <button onClick={loadKeys} disabled={isLoadingKeys} className={`${btnSecondary} h-10`}>
                      <RefreshCw size={16} className={isLoadingKeys ? 'animate-spin' : ''} />
                      Refresh
                    </button>
                  }
                />

                {keysError && <div className={`${errorBox} mb-4`}>{keysError}</div>}

                {issuedKey && (
                  <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                    <p className="text-sm font-semibold text-blue-900">New key for {issuedKey.institutionName}</p>
                    <CopyBox value={issuedKey.key} field="issued" label="API key" />
                    <p className="text-xs text-blue-900">Copy it now. It will not be shown again.</p>
                  </div>
                )}

                {isLoadingKeys && !institutions.length ? (
                  <div className="py-10 flex justify-center text-slate-500"><Loader2 className="animate-spin" /></div>
                ) : institutions.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-600">
                    No partner institutions yet.{' '}
                    <button onClick={() => setActiveTab('add')} className="text-teal-700 font-semibold hover:underline">Add one</button>
                  </div>
                ) : (
                  <div className="overflow-x-auto -mx-6">
                    <table className="w-full text-left text-sm min-w-[560px]">
                      <thead>
                        <tr className={thRow}>
                          <th className="py-3 px-6 font-semibold">Institution</th>
                          <th className="py-3 px-3 font-semibold">LMS</th>
                          <th className="py-3 px-3 font-semibold">Admin</th>
                          <th className="py-3 px-3 font-semibold">Active keys</th>
                          <th className="py-3 px-6"><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {institutions.map(inst => (
                          <tr key={inst.id} className="border-t border-slate-100">
                            <td className="py-3 px-6">
                              <p className="font-semibold text-slate-900">{inst.name}</p>
                              <p className="text-xs font-mono text-slate-600">{inst.id}</p>
                            </td>
                            <td className="py-3 px-3 text-slate-700">{inst.lmsSystem || '—'}</td>
                            <td className="py-3 px-3 text-slate-700">{inst.contactEmail || '—'}</td>
                            <td className="py-3 px-3 font-bold text-slate-900">{inst.activeApiKeys}</td>
                            <td className="py-3 px-6 text-right">
                              <button
                                onClick={() => handleIssueKey(inst)}
                                disabled={busyKeyAction === inst.id}
                                className="text-sm text-teal-700 font-semibold hover:underline disabled:opacity-50 whitespace-nowrap"
                              >
                                {busyKeyAction === inst.id ? 'Issuing…' : 'Issue new key'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className={card}>
                <CardHeader title="API keys" subtitle="Only the first characters of each key are stored in readable form." />
                {apiKeys.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-600">No API keys issued yet.</p>
                ) : (
                  <div className="overflow-x-auto -mx-6">
                    <table className="w-full text-left text-sm min-w-[560px]">
                      <thead>
                        <tr className={thRow}>
                          <th className="py-3 px-6 font-semibold">Key</th>
                          <th className="py-3 px-3 font-semibold">Institution</th>
                          <th className="py-3 px-3 font-semibold">Status</th>
                          <th className="py-3 px-3 font-semibold">Last used</th>
                          <th className="py-3 px-6"><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {apiKeys.map(key => (
                          <tr key={key.id} className="border-t border-slate-100">
                            <td className="py-3 px-6">
                              <p className="font-mono text-slate-900">{key.keyPrefix}</p>
                              <p className="text-xs text-slate-600">{key.adminEmail}</p>
                            </td>
                            <td className="py-3 px-3 text-slate-700">
                              {institutions.find(i => i.id === key.institutionId)?.name || key.institutionId}
                            </td>
                            <td className="py-3 px-3">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${
                                key.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-rose-50 text-rose-700'
                              }`}>{key.status}</span>
                            </td>
                            <td className="py-3 px-3 text-slate-600 text-xs">{formatDate(key.lastUsedAt)}</td>
                            <td className="py-3 px-6 text-right">
                              {key.status === 'active' && (
                                <button
                                  onClick={() => handleRevokeKey(key)}
                                  disabled={busyKeyAction === key.id}
                                  className="inline-flex items-center gap-1 h-8 px-3 border border-rose-300 text-rose-700 rounded-md text-xs font-bold hover:bg-rose-50 disabled:opacity-50"
                                >
                                  <Ban size={12} />
                                  Revoke
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'api-integration' && (
            <div className="space-y-6">
              {/* Overview */}
              <div className={card}>
                <CardHeader
                  title="Course ingestion API"
                  subtitle="Partners upload course files with their API key. The backend stores the file in S3 and sends it to the AI engine, which indexes it for the tutor."
                />
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div className="p-3 rounded-md border border-slate-200">
                    <p className="text-slate-600 mb-1">Upload a course file</p>
                    <p className="font-mono font-bold text-teal-700">POST /upload/course/:courseId</p>
                  </div>
                  <div className="p-3 rounded-md border border-slate-200">
                    <p className="text-slate-600 mb-1">Check ingestion progress</p>
                    <p className="font-mono font-bold text-teal-700">GET /ingestion/status/:eventId</p>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mt-3 font-mono break-all">Base URL: {apiBase}</p>
              </div>

              {/* Code Snippets */}
              <div className={card}>
                <CardHeader
                  title="Request examples"
                  subtitle="Upload a file, then poll its status with the returned eventId."
                />
                <div className="flex gap-5 border-b border-slate-200 mb-3" role="tablist">
                  {([['curl', 'cURL'], ['python', 'Python'], ['node', 'Node.js']] as const).map(([id, label]) => (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={activeIngestSnippet === id}
                      onClick={() => setActiveIngestSnippet(id)}
                      className={`-mb-px pb-2 text-sm font-semibold border-b-2 ${
                        activeIngestSnippet === id ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <pre className="p-4 pr-24 bg-slate-900 rounded-md text-slate-100 font-mono text-xs overflow-x-auto leading-relaxed">
                    {activeSnippet}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(activeSnippet, 'ingest-snippet')}
                    className="absolute top-3 right-3 h-8 px-2.5 bg-white text-slate-700 rounded-md border border-slate-300 flex items-center gap-1.5 text-xs font-semibold hover:bg-slate-50"
                  >
                    {copiedField === 'ingest-snippet' ? <Check size={14} className="text-green-700" /> : <Copy size={14} />}
                    {copiedField === 'ingest-snippet' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Interactive Tester */}
              <div className={`${card} space-y-4`}>
                <CardHeader
                  title="Ingestion API tester"
                  subtitle="Sends a real upload to the backend. It needs S3 and the AI engine to be configured there."
                />

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="ingest-course" className={labelCls}>Course</label>
                    <div className="relative">
                      <select
                        id="ingest-course"
                        value={testCourseId}
                        onChange={(e) => setTestCourseId(e.target.value)}
                        className={`${inputCls} appearance-none pr-9`}
                      >
                        {courses.length === 0 && <option value="">No courses found</option>}
                        {courses.map(c => (
                          <option key={c.courseId} value={c.courseId}>{c.courseName || c.courseId} ({c.courseId})</option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="ingest-file" className={labelCls}>File</label>
                    <label htmlFor="ingest-file" className="w-full h-11 px-3 bg-white border border-dashed border-slate-300 rounded-md text-sm text-slate-700 flex items-center gap-2 cursor-pointer hover:border-teal-600">
                      <Upload size={16} className="text-teal-700 shrink-0" />
                      <span className="truncate">{testFile ? testFile.name : 'Choose a PDF, document or audio file'}</span>
                    </label>
                    <input id="ingest-file" type="file" accept=".pdf,.docx,.pptx,.txt,.mp3,.wav,.m4a,.mp4" className="sr-only" onChange={(e) => setTestFile(e.target.files?.[0] || null)} />
                  </div>
                </div>

                <div>
                  <label htmlFor="ingest-key" className={labelCls}>Partner API key (optional)</label>
                  <input
                    id="ingest-key"
                    type="password"
                    value={testApiKey}
                    onChange={(e) => setTestApiKey(e.target.value)}
                    placeholder="enara_live_... (leave empty to use your own session)"
                    autoComplete="off"
                    className={`${inputCls} font-mono`}
                  />
                  <p className="text-xs text-slate-600 mt-1">With a key, the request runs exactly as the partner's system would, limited to that partner's institution.</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleExecuteApiTest}
                    disabled={isSendingApiRequest || !testCourseId || !testFile}
                    className={btnPrimary}
                  >
                    {isSendingApiRequest ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Send size={16} />
                        Send upload request
                      </>
                    )}
                  </button>
                  {uploadEventId && (
                    <button
                      onClick={handleCheckStatus}
                      disabled={isCheckingStatus}
                      className={btnSecondary}
                    >
                      {isCheckingStatus ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                      Check ingestion status
                    </button>
                  )}
                </div>

                {apiTestResponse && renderResponse('POST /upload/course', apiTestResponse)}
                {statusResponse && renderResponse('GET /ingestion/status', statusResponse)}
              </div>
            </div>
          )}

          {activeTab === 'docs' && (
            <div className="space-y-6">
              <div className={card}>
                <CardHeader
                  title="Partner API"
                  subtitle={<>Authenticate with <code className="font-mono text-slate-800">Authorization: Bearer &lt;API key&gt;</code>. A key acts as the admin it was issued to and only reaches that admin's institution.</>}
                />
                <div className="overflow-x-auto -mx-6">
                  <table className="w-full text-left text-sm min-w-[640px]">
                    <thead>
                      <tr className={thRow}>
                        <th className="py-3 px-6 font-semibold">Endpoint</th>
                        <th className="py-3 px-3 font-semibold">Permission</th>
                        <th className="py-3 px-6 font-semibold">Description</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-700">
                      <tr className="border-t border-slate-100 align-top">
                        <td className="py-3 px-6 font-mono font-bold text-teal-700 whitespace-nowrap">POST /upload/course/:courseId</td>
                        <td className="py-3 px-3 font-mono text-slate-600">curriculum:ingest</td>
                        <td className="py-3 px-6">
                          Multipart upload with one <code className="font-mono">file</code> field (.pdf, .docx, .pptx, .txt, .mp3, .wav, .m4a or .mp4, up to 50 MB).
                          Returns <code className="font-mono">202</code> with <code className="font-mono">eventId</code>, <code className="font-mono">ingestionId</code> and <code className="font-mono">s3Key</code>.
                          The course must belong to the key's institution, otherwise <code className="font-mono">404</code>.
                        </td>
                      </tr>
                      <tr className="border-t border-slate-100 align-top">
                        <td className="py-3 px-6 font-mono font-bold text-teal-700 whitespace-nowrap">GET /ingestion/status/:eventId</td>
                        <td className="py-3 px-3 font-mono text-slate-600">ingestion:read</td>
                        <td className="py-3 px-6">
                          Returns the ingestion job: <code className="font-mono">status</code> (submitted, queued, running, processing, completed, partially_completed or failed),
                          <code className="font-mono"> chunk_count</code>, <code className="font-mono">language</code>, any error, and the AI engine's latest status.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={card}>
                <CardHeader title="Errors" subtitle={<>Errors return <code className="font-mono">{'{ "error": { "code", "message", "requestId" } }'}</code>.</>} />
                <div className="overflow-x-auto -mx-6">
                  <table className="w-full text-left text-sm min-w-[560px]">
                    <tbody className="text-slate-700">
                      <tr className="border-t border-slate-100"><td className="py-2.5 px-6 font-mono font-bold whitespace-nowrap">401 INVALID_API_KEY</td><td className="py-2.5 px-6">The key is unknown, revoked or expired, or its admin account is disabled.</td></tr>
                      <tr className="border-t border-slate-100"><td className="py-2.5 px-6 font-mono font-bold whitespace-nowrap">403 API_KEY_PERMISSION_DENIED</td><td className="py-2.5 px-6">The key lacks the permission the endpoint needs.</td></tr>
                      <tr className="border-t border-slate-100"><td className="py-2.5 px-6 font-mono font-bold whitespace-nowrap">404 COURSE_NOT_FOUND</td><td className="py-2.5 px-6">No such course in the key's institution.</td></tr>
                      <tr className="border-t border-slate-100"><td className="py-2.5 px-6 font-mono font-bold whitespace-nowrap">503 AI_ENGINE_UNAVAILABLE</td><td className="py-2.5 px-6">The backend has no AI ingestion engine configured.</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={card}>
                <CardHeader title="Enara admin endpoints" subtitle="Used by this page. They need an Enara admin session; API keys are not accepted." />
                <div className="overflow-x-auto -mx-6">
                  <table className="w-full text-left text-sm min-w-[640px]">
                    <tbody className="text-slate-700">
                      <tr className="border-t border-slate-100"><td className="py-2.5 px-6 font-mono font-bold whitespace-nowrap">GET /integrations/institutions</td><td className="py-2.5 px-6">List partner institutions with their active key counts.</td></tr>
                      <tr className="border-t border-slate-100"><td className="py-2.5 px-6 font-mono font-bold whitespace-nowrap">POST /integrations/institutions</td><td className="py-2.5 px-6">Create an institution, its admin login and an API key. The password and key are returned once.</td></tr>
                      <tr className="border-t border-slate-100"><td className="py-2.5 px-6 font-mono font-bold whitespace-nowrap">POST /integrations/institutions/:id/api-keys</td><td className="py-2.5 px-6">Issue another key for an institution's admin.</td></tr>
                      <tr className="border-t border-slate-100"><td className="py-2.5 px-6 font-mono font-bold whitespace-nowrap">GET /integrations/api-keys</td><td className="py-2.5 px-6">List keys (prefix, owner, status, last use). Filter with <code className="font-mono">?institutionId=</code>.</td></tr>
                      <tr className="border-t border-slate-100"><td className="py-2.5 px-6 font-mono font-bold whitespace-nowrap">POST /integrations/api-keys/:id/revoke</td><td className="py-2.5 px-6">Revoke a key immediately.</td></tr>
                      <tr className="border-t border-slate-100"><td className="py-2.5 px-6 font-mono font-bold whitespace-nowrap">POST /integrations/api-keys/validate</td><td className="py-2.5 px-6">Check a key against an admin, institution and LMS.</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'validate' && (
            <div className={card}>
              <CardHeader title="API key validator" subtitle="Verify administrator access and permissions." />

              <form onSubmit={handleValidate} className="space-y-4">
                <div>
                  <label htmlFor="val-key" className={labelCls}>API key (bearer token)</label>
                  <input
                    id="val-key"
                    type="password"
                    required
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="enara_live_..."
                    className={`${inputCls} font-mono`}
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="val-admin" className={labelCls}>Admin identifier</label>
                    <input
                      id="val-admin"
                      type="text"
                      required
                      value={adminId}
                      onChange={(e) => setAdminId(e.target.value)}
                      placeholder="Email or Admin ID"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label htmlFor="val-inst" className={labelCls}>Institution identifier</label>
                    <input
                      id="val-inst"
                      type="text"
                      required
                      value={institutionId}
                      onChange={(e) => setInstitutionId(e.target.value)}
                      placeholder="Name or Org ID"
                      className={inputCls}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="val-lms" className={labelCls}>LMS system ID (optional)</label>
                  <input
                    id="val-lms"
                    type="text"
                    value={lmsId}
                    onChange={(e) => setLmsId(e.target.value)}
                    placeholder="e.g. moodle"
                    className={inputCls}
                  />
                </div>

                <div className="pt-2 flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={resetForm} className={btnSecondary}>
                    <RefreshCw size={16} />
                    Reset
                  </button>
                  <button type="submit" disabled={isValidating} className={btnPrimary}>
                    {isValidating ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Validating...
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={16} />
                        Validate access
                      </>
                    )}
                  </button>
                </div>
              </form>
              {validateError && <div className={`${errorBox} mt-4`}>{validateError}</div>}
            </div>
          )}

          {activeTab === 'add' && (
            <div className={card}>
              <CardHeader title="Add institution" subtitle="Onboard a new partner and generate secure credentials." />

              <form onSubmit={handleCreate} className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="add-inst" className={labelCls}>Institution name</label>
                    <input
                      id="add-inst"
                      type="text"
                      required
                      value={newInstName}
                      onChange={(e) => setNewInstName(e.target.value)}
                      placeholder="e.g. Global Tech Institute"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label htmlFor="add-lms" className={labelCls}>LMS system</label>
                    <div className="relative">
                      <select
                        id="add-lms"
                        required
                        value={newLmsSystem}
                        onChange={(e) => setNewLmsSystem(e.target.value)}
                        className={`${inputCls} appearance-none pr-9`}
                      >
                        <option value="">Select LMS</option>
                        <option value="canvas">Canvas LMS</option>
                        <option value="moodle">Moodle</option>
                        <option value="blackboard">Blackboard</option>
                        <option value="google-classroom">Google Classroom</option>
                        <option value="custom">Custom Integration</option>
                      </select>
                      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <fieldset className="pt-5 border-t border-slate-100 space-y-4">
                  <legend className="sr-only">Admin contact details</legend>
                  <h3 className="font-bold text-slate-900">Admin contact details</h3>
                  <div>
                    <label htmlFor="add-admin" className={labelCls}>Admin full name</label>
                    <input
                      id="add-admin"
                      type="text"
                      required
                      value={newAdminName}
                      onChange={(e) => setNewAdminName(e.target.value)}
                      placeholder="John Doe"
                      className={inputCls}
                    />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="add-email" className={labelCls}>Email address</label>
                      <input
                        id="add-email"
                        type="email"
                        required
                        value={newAdminEmail}
                        onChange={(e) => setNewAdminEmail(e.target.value)}
                        placeholder="admin@institution.edu"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label htmlFor="add-phone" className={labelCls}>Phone number</label>
                      <input
                        id="add-phone"
                        type="tel"
                        value={newAdminPhone}
                        onChange={(e) => setNewAdminPhone(e.target.value)}
                        placeholder="+1 (555) 000-0000"
                        className={inputCls}
                      />
                    </div>
                  </div>
                </fieldset>

                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={resetForm} className={btnSecondary}>
                    <RefreshCw size={16} />
                    Reset
                  </button>
                  <button type="submit" disabled={isCreating} className={btnPrimary}>
                    {isCreating ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Creating institution...
                      </>
                    ) : (
                      <>
                        <Key size={16} />
                        Onboard & generate API key
                      </>
                    )}
                  </button>
                </div>
              </form>
              {createError && <div className={`${errorBox} mt-4`}>{createError}</div>}
            </div>
          )}

          {/* Validation Results */}
          {activeTab === 'validate' && result && (
            <div className={`bg-white border rounded-xl p-6 ${result.isValid ? 'border-green-200' : 'border-rose-200'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                <div className="flex items-start gap-3">
                  {result.isValid ? <CheckCircle2 size={22} className="text-green-700 mt-0.5" /> : <ShieldAlert size={22} className="text-rose-700 mt-0.5" />}
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Validation result</h3>
                    <p className={`text-sm ${result.isValid ? 'text-green-700' : 'text-rose-700'}`}>{result.message}</p>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                  result.isValid ? 'bg-green-50 text-green-700' : 'bg-rose-50 text-rose-700'
                }`}>
                  {result.isValid ? 'Authorized' : 'Denied'}
                </span>
              </div>

              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-semibold text-slate-800 mb-2">Security checks</h4>
                  <dl className="divide-y divide-slate-100 text-sm">
                    <div className="flex items-center justify-between py-2">
                      <dt className="text-slate-600">Key status</dt>
                      <dd className={`font-bold capitalize ${
                        result.details?.apiKeyStatus === 'active' ? 'text-green-700' : 'text-rose-700'
                      }`}>{result.details?.apiKeyStatus.replace('_', ' ')}</dd>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <dt className="text-slate-600">Admin identity</dt>
                      <dd className={`font-bold ${result.details?.adminMatch ? 'text-green-700' : 'text-rose-700'}`}>{result.details?.adminMatch ? 'Verified' : 'Mismatch'}</dd>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <dt className="text-slate-600">Institution scope</dt>
                      <dd className={`font-bold ${result.details?.institutionMatch ? 'text-green-700' : 'text-rose-700'}`}>{result.details?.institutionMatch ? 'Verified' : 'Mismatch'}</dd>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <dt className="text-slate-600">LMS integration</dt>
                      <dd className={`font-bold ${result.details?.lmsMatch ? 'text-green-700' : 'text-rose-700'}`}>{result.details?.lmsMatch ? 'Verified' : 'Mismatch'}</dd>
                    </div>
                  </dl>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-slate-800 mb-2">Permissions granted</h4>
                  <div className="flex flex-wrap gap-2">
                    {result.details?.permissions.length ? (
                      result.details.permissions.map((perm, i) => (
                        <span key={i} className="rounded-full px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-bold font-mono">
                          {perm}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-slate-600">No permissions found</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Creation Results */}
          {activeTab === 'add' && creationResult && (
            <div className="bg-white border border-green-200 rounded-xl p-6 space-y-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={22} className="text-green-700 mt-0.5" />
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Institution onboarded</h3>
                  <p className="text-sm text-slate-600">{creationResult.message}</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-800 mb-2">Login credentials</h4>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-600 mb-1">Login email</p>
                    <CopyBox value={creationResult.credentials?.username || ''} field="user" label="login email" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-600 mb-1">Password</p>
                    <CopyBox value={creationResult.credentials?.password || ''} field="pass" label="password" />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-800 mb-2">API key</h4>
                <CopyBox value={creationResult.apiKey || ''} field="key" label="API key" />
                <p className="text-xs text-slate-600 mt-2">
                  Copy the password and key now; neither is shown again. The key belongs to {creationResult.institution.name} and works for course uploads and ingestion status.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Info */}
        <aside className="space-y-6">
          <div className={card}>
            <div className="flex items-center gap-2 mb-2">
              <Lock size={18} className="text-teal-700" />
              <h3 className="text-lg font-bold text-slate-900">Handling API keys</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4 leading-relaxed">
              API keys should be treated with the same sensitivity as passwords. Never share them in plain text or commit them to public repositories.
            </p>
            <ul className="space-y-3">
              {[
                'Enara stores only a hash of each key, so a lost key cannot be recovered. Issue a new one and revoke the old one.',
                'Keep keys in environment variables or a secrets manager on the partner side.',
                'Revoke a key as soon as it may have leaked; it stops working immediately.',
              ].map(tip => (
                <li key={tip} className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 size={16} className="text-teal-700 shrink-0 mt-0.5" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
      )}
    </div>
  );
};
