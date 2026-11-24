import { describe, expect, it } from 'vitest';
import { checkRow, parseAmount, parseFeeStatus } from '../../src/schoolApp/importSpec';
import { rowsFromCsv } from '../../src/schoolApp/importer';
import { feeTotals, shownStatus } from '../../src/schoolApp/fees';
import { headline } from '../../src/schoolApp/emails';

// Parents school app, step (b): fee sheet parsing and the fee rules (display only; the school marks paid).
describe('fee sheet', () => {
  it('reads amounts in the usual forms, with Arabic digits and currency words', () => {
    expect(parseAmount('1,250.50')).toBe('1250.5');
    expect(parseAmount('١٢٥٠')).toBe('1250');
    expect(parseAmount('EGP 3,000')).toBe('3000');
    expect(parseAmount('3000 ج.م')).toBe('3000');
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('1.234')).toBeNull();
  });
  it('maps statuses (English and Arabic); "overdue" in a sheet is due; empty is due', () => {
    expect(parseFeeStatus('Paid')).toBe('paid');
    expect(parseFeeStatus('مدفوع')).toBe('paid');
    expect(parseFeeStatus('معفى')).toBe('waived');
    expect(parseFeeStatus('overdue')).toBe('due');
    expect(parseFeeStatus('')).toBe('due');
    expect(parseFeeStatus('maybe')).toBeNull();
  });
  it('Arabic headers map; a paid row needs its paid date; dates are day first', () => {
    const { rows, missing } = rowsFromCsv('fees', 'رقم الطالب,اسم الطالب,الخطة,رقم القسط,المبلغ,تاريخ الاستحقاق,الحالة,تاريخ الدفع\nS1,Omar,Tuition,1,"5,000",15/09/2026,مدفوع,14/09/2026\nS1,Omar,Tuition,2,5000,15/12/2026,مدفوع,');
    expect(missing).toEqual([]);
    expect(checkRow('fees', rows[0]).row).toMatchObject({ student: 'S1', plan: 'Tuition', number: '1', amount: '5000', due_date: '2026-09-15', status: 'paid', paid_date: '2026-09-14' });
    expect(checkRow('fees', rows[1]).problems).toContain('a paid instalment needs its paid date');
  });
});

describe('fee rules', () => {
  const today = '2026-11-24';
  it('overdue is worked out from the due date (Cairo), never stored', () => {
    expect(shownStatus({ status: 'due', dueDate: '2026-11-23' }, today)).toBe('overdue');
    expect(shownStatus({ status: 'due', dueDate: '2026-11-24' }, today)).toBe('due');
    expect(shownStatus({ status: 'paid', dueDate: '2026-01-01' }, today)).toBe('paid');
  });
  it('totals: waived counts as neither paid nor remaining', () => {
    expect(feeTotals([
      { amount: 5000, status: 'paid', dueDate: '2026-09-15' }, { amount: 5000, status: 'due', dueDate: '2026-11-15' },
      { amount: 5000, status: 'due', dueDate: '2027-02-15' }, { amount: 1000, status: 'waived', dueDate: '2026-10-01' },
    ], today)).toEqual({ total: 16000, paid: 5000, waived: 1000, remaining: 10000, overdue: 5000 });
  });
  it('reminder headline in English and Arabic', () => {
    expect(headline('fee_due', 'en', 'Omar', '2026-12-01', 'x', 5000)).toMatch(/^Omar's fee instalment is due on Tuesday,? 1 Dec: 5000 EGP$/);
    expect(headline('fee_due', 'ar', 'عمر', '2026-12-01', 'x', 5000)).toMatch(/^قسط رسوم عمر مستحق يوم .*: 5000 جنيه$/);
  });
});
