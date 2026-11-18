import type { ILmsContext } from '../models';
import type { RosterSyncOutcome } from './roster';

// Extension point called by core/roster.ts after every roster sync that read
// the LMS successfully (teacher launch, nightly, "Sync roster now", cron).
// Intentionally a no-op in Phase 4: the grade ledger (separate branch: AGS
// result.readonly, "changed in LMS") wires its LMS-result check in here when
// the branches are merged. It must stay bounded and must never throw into the
// sync (the caller catches and logs, IDs only).
export async function afterRosterSync(_context: ILmsContext, _outcome: RosterSyncOutcome): Promise<void> {
  // Intentionally empty (see above).
}
