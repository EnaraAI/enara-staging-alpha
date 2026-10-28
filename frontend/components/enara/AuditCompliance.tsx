
import React from 'react';
import { ShieldCheck, Lock, FileSignature, AlertCircle, Download } from 'lucide-react';

const AUDIT_LOGS = [
  { id: '1', timestamp: '2026-04-02 12:45:22', actor: 'Director Khalid', role: 'Admin', action: 'Access Grant', category: 'Access', details: 'Granted "Teacher" role to Sarah Ahmed', ip: '192.168.1.42', signature: 'sha256:8f3e...' },
  { id: '2', timestamp: '2026-04-02 12:30:15', actor: 'System', role: 'System', action: 'Failed Login Threshold', category: 'Security', details: 'User STU-882 exceeded failed login attempts (5)', ip: '45.12.33.1', signature: 'sha256:c9d8...' },
  { id: '3', timestamp: '2026-04-02 11:15:00', actor: 'Enara Executive', role: 'Enara Admin', action: 'Credit Allocation', category: 'Configuration', details: 'Allocated 500,000 credits to Global Tech Academy', ip: '10.0.0.5', signature: 'sha256:a2b1...' },
  { id: '4', timestamp: '2026-04-02 10:05:42', actor: 'Admin Sarah', role: 'Admin', action: 'Data Export Signature', category: 'Data', details: 'Exported "Student Performance Report" for Grade 10', ip: '172.16.0.12', signature: 'sha256:f4e3...' },
  { id: '5', timestamp: '2026-04-02 09:30:12', actor: 'System', role: 'System', action: 'System-Level Change Log', category: 'System', details: 'Updated RAG model version to v2.4.1', ip: 'internal', signature: 'sha256:d5c2...' },
  { id: '6', timestamp: '2026-04-02 08:45:00', actor: 'Director Khalid', role: 'Admin', action: 'PII Access Log', category: 'Security', details: 'Viewed sensitive student records for "At Risk" intervention', ip: '192.168.1.42', signature: 'sha256:b1a0...' },
];

export const AuditCompliance: React.FC = () => {
  const th = 'px-5 py-3 font-semibold';
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-teal-700">Enara business</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold text-slate-900">Audit &amp; compliance</h1>
            <p className="mt-2 inline-block text-xs font-bold uppercase tracking-wide bg-amber-100 text-amber-900 rounded px-2 py-1">Sample data: example figures, not connected to live records yet</p>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">Sample data</span>
          </div>
          <p className="mt-1 text-slate-600">Cryptographically signed logs for all privileged actions.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex items-center gap-2 h-10 px-4 border border-slate-300 bg-white text-slate-700 rounded-md text-sm font-semibold hover:bg-slate-50">
            <Download size={16} aria-hidden="true" /> Export for audit
          </button>
          <button className="inline-flex items-center gap-2 h-10 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-sm font-bold">
            Verify integrity
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-sm text-slate-600 flex items-center gap-2"><ShieldCheck size={16} className="text-green-700" aria-hidden="true" /> SOC2 status</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-900">Compliant</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-sm text-slate-600 flex items-center gap-2"><FileSignature size={16} className="text-teal-700" aria-hidden="true" /> Signed logs</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-900">124,842</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
          <p className="text-sm text-orange-800 flex items-center gap-2"><AlertCircle size={16} aria-hidden="true" /> Security alerts</p>
          <p className="mt-1 text-3xl font-extrabold text-orange-800">2 active</p>
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl">
        <div className="px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Immutable audit ledger</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-t border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className={th}>Timestamp</th>
                <th className={th}>Actor</th>
                <th className={th}>Action</th>
                <th className={th}>Details</th>
                <th className={th}>Signature</th>
              </tr>
            </thead>
            <tbody>
              {AUDIT_LOGS.map((log) => (
                <tr key={log.id} className="border-t border-slate-100 align-top">
                  <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{log.timestamp}</td>
                  <td className="px-5 py-3">
                    <p className="font-semibold text-slate-900">{log.actor}</p>
                    <p className="text-xs text-slate-600">{log.role}</p>
                  </td>
                  <td className="px-5 py-3">
                    <p className="font-semibold text-slate-900">{log.action}</p>
                    <span className="mt-1 inline-block rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-800">{log.category}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-700 max-w-xs">{log.details}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-600 whitespace-nowrap">
                      <Lock size={12} aria-hidden="true" /> {log.signature}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
