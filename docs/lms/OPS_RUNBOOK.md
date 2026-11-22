# LMS operations runbook (ENARA ops)

> lms-test only for now. test.enara.app is **frozen until Mohamed reopens** (see the standing rule in `IMPLEMENTATION_PLAN.md`).

## 1. Permanent deletion stopped: LMS_KEK missing

**What happened:** a school or ENARA admin asked to permanently delete (PDPL) a student who has an LMS identity, but `LMS_KEK` is not set. ENARA must record the LMS identity on the suppression list *before* deleting anything (Priority 0 item 3), so a roster sync or a launch can never re-create the student. Without the key it cannot, so **nothing was deleted**.

**How you know:**
- A **critical** alert `pdpl_erasure_blocked_lms_kek` appears in `alert_events`, with `studentId`, `institutionId` and the number of LMS identities (IDs only).
- An audit row `student_erasure_blocked` appears, with reason `lms_kek_missing`.
- The admin saw: "This student could not be permanently deleted yet … Your request is recorded and ENARA operations have been alerted to complete it urgently. Reference: LMS_SUPPRESSION_UNAVAILABLE."

**Do this now. A PDPL request can't wait.**
1. Restore `LMS_KEK` on that deployment (Vercel env, Sensitive). Use the **same** key as before; a new key would break every stored LMS secret. Redeploy.
2. Check `/api/lms/status`, which reports the LMS configuration problem by variable name only. It should show no problem.
3. Run the deletion again: as an ENARA admin, open the student and choose **Delete permanently**, or ask the school admin to retry. It must now succeed, and write `lms.identity_suppressed`.
4. Tell the school the deletion is complete. Record the ticket and the time taken.

**Until LMS email exists:** the alert is stored and logged (`delivery: not_configured`). ENARA ops must watch `alert_events` for critical rows. When LMS ops email is on (`LMS_OPS_EMAILS`), this alert will also email ops.

## 2. Rotating LMS_KEK

`LMS_KEK` encrypts the stored LMS secrets (tool keys, access tokens). It also keys the hashes on the **PDPL suppression list**. The raw LMS IDs are never stored, so suppression rows **cannot be re-hashed** with a new key.

When rotating:
1. Set the new key as `LMS_KEK`, and the old key as **`LMS_KEK_PREVIOUS`**. Redeploy.
2. **Keep `LMS_KEK_PREVIOUS` permanently**, for as long as suppression rows made with it must keep blocking, which in practice is forever. Removing it would let permanently deleted students be re-created by a roster sync or a launch.
3. Only one previous key is supported. Before a **second** rotation, plan the suppression list: re-erase or re-suppress, with Mohamed's decision, before dropping the oldest key.

## 3. Lifting a suppression (rare)

Do this only when a school confirms in writing that a student who was permanently deleted is coming back.
1. As an ENARA admin, `GET /api/lms/suppressions?institutionId=…` gives the rows by ID. Then `POST /api/lms/suppressions/:id/lift`.
2. The lift is audited (`lms.identity_suppression_lifted`).
3. The next roster sync creates a **new** account, with no old data.

## 4. The live avatar's Anam account (lms-test)
- **Account:** since 22 Nov 2026, lms-test's `ANAM_API_KEY` (Vercel, Production, Sensitive, set by hand) is a key of the Anam organization **"Enara"**. The organization it used before had reached its usage limit.
- **Free plan limits:** 30 session minutes a month (hard cap), 3 minutes per session, 1 session at a time. Real lessons are cut off at 3 minutes on this plan.
- **Changing the key:** a new value applies only after the next deploy, i.e. the next PR into `lms-test-live`.
- **Checking minutes:** in Lab (lab.anam.ai) → Usage, or through the Anam connector (`anam_usage_get`).
