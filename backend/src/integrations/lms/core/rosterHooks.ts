import type { ILmsContext } from '../models';
import type { RosterSyncOutcome } from './roster';

// Called by core/roster.ts after every roster sync that read the LMS
// successfully (teacher launch, nightly, "Sync roster now", cron). Wires the
// grade ledger's LMS-result check (owner decision 4e: detect grades changed
// directly in the LMS) into the sync. Bounded; never throws into the sync.
export async function afterRosterSync(context: ILmsContext, _outcome: RosterSyncOutcome): Promise<void> {
  const { gradeLedgerOn } = await import('../../../services/gradeLedger');
  if (!gradeLedgerOn()) return;
  const { checkLmsResults } = await import('./lmsResults');
  await checkLmsResults(context, { limit: 100, budgetMs: 10_000 });
}
