
import React from 'react';
import { Clock, RefreshCw } from 'lucide-react';

const CONTRACTS = [
  { id: '1', institution: 'Global Tech Academy', start: '2025-09-01', expiry: '2026-09-01', value: 5040000, credits: 1200000, pricePerCredit: 4.2, tier: 'Enterprise', discount: 10, autoRenewal: true, status: 'Active' },
  { id: '2', institution: 'Future Skills Inst.', start: '2025-10-05', expiry: '2026-10-05', value: 3420000, credits: 500000, pricePerCredit: 6.84, tier: 'Custom', discount: 5, autoRenewal: true, status: 'Active' },
  { id: '3', institution: 'Elite Learning Corp', start: '2025-11-20', expiry: '2026-11-20', value: 2304000, credits: 800000, pricePerCredit: 2.88, tier: 'Enterprise', discount: 15, autoRenewal: false, status: 'Active' },
  { id: '4', institution: 'Standard University', start: '2025-08-15', expiry: '2026-08-15', value: 3720000, credits: 200000, pricePerCredit: 18.6, tier: 'Standard', discount: 0, autoRenewal: false, status: 'Pending Renewal' },
];

export const ContractManagement: React.FC = () => {
  const getDaysUntilExpiry = (expiry: string) => {
    const today = new Date();
    const expiryDate = new Date(expiry);
    const diffTime = expiryDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const th = 'px-5 py-3 font-semibold';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-teal-700">Enara business</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold text-slate-900">Contracts</h1>
          <p className="mt-2 inline-block text-xs font-bold uppercase tracking-wide bg-amber-100 text-amber-900 rounded px-2 py-1">Sample data: example figures, not connected to live records yet</p>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">Sample data</span>
        </div>
        <p className="mt-1 text-slate-600">Contract values, tiers and the renewal calendar for partner institutions.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-sm text-slate-600">Avg contract value</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-900">$3.62M</p>
          <p className="mt-1 text-sm font-semibold text-green-700">+5.2% YoY</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-sm text-slate-600">Active contracts</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-900">{CONTRACTS.length}</p>
          <p className="mt-1 text-sm text-slate-600">4 pending renewal</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-sm text-slate-600">Renewal rate</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-900">94.2%</p>
          <p className="mt-1 text-sm text-slate-600">Target: 95%</p>
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl">
        <div className="px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Renewal calendar</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-t border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className={th}>Institution</th>
                <th className={th}>Tier</th>
                <th className={th}>Contract value</th>
                <th className={th}>Expiry</th>
                <th className={th}>Auto-renew</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {CONTRACTS.map((contract) => {
                const days = getDaysUntilExpiry(contract.expiry);
                return (
                  <tr key={contract.id} className="border-t border-slate-100">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-900">{contract.institution}</p>
                      <p className="text-xs text-slate-600">Started {contract.start}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        contract.tier === 'Enterprise' ? 'bg-blue-50 text-blue-800' :
                        contract.tier === 'Custom' ? 'bg-sky-50 text-sky-800' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {contract.tier}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-900">${(contract.value / 1000000).toFixed(2)}M</p>
                      <p className="text-xs text-slate-600">{contract.credits.toLocaleString()} credits @ ${contract.pricePerCredit}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className={`font-semibold ${days < 30 ? 'text-red-700' : 'text-slate-900'}`}>{days} days left</p>
                      <p className="text-xs text-slate-600">{contract.expiry}</p>
                    </td>
                    <td className="px-5 py-3">
                      {contract.autoRenewal ? (
                        <span className="inline-flex items-center gap-1.5 text-green-700 font-semibold"><RefreshCw size={14} aria-hidden="true" /> On</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-slate-600"><Clock size={14} aria-hidden="true" /> Off</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${
                        contract.status === 'Active' ? 'bg-green-50 text-green-800' :
                        'bg-orange-50 text-orange-800'
                      }`}>
                        {contract.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
