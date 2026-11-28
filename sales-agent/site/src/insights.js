// Insights: SQL aggregates over the docs table (the browser never downloads every lead). Days are Cairo days.

const DAY_MS = 86400000;
const cairoDayOf = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date(ms));
const addDay = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);
// The UTC instant of midnight in Cairo on `day` (Cairo is UTC+2, or +3 in summer time).
function cairoMidnight(day) {
  const g = Date.parse(day + 'T00:00:00Z');
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(g)).map(x => [x.type, x.value]));
  const local = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
  return g - (local - g);
}
const RANGES = { '7': 7, '30': 30, '90': 90, all: 0 };
const BEST_SQL = "CASE COALESCE(json_extract(data, '$.stageBest'), json_extract(data, '$.stage'), 'none') WHEN 'replied' THEN 1 WHEN 'meeting_booked' THEN 2 WHEN 'demo_done' THEN 3 WHEN 'proposal_sent' THEN 4 WHEN 'won' THEN 5 ELSE 0 END";
const HAS_SENT_SQL = "CASE WHEN json_array_length(data, '$.sentLog') > 0 THEN 1 ELSE 0 END";
const REPLIED_SQL = `CASE WHEN json_extract(data, '$.repliedAt') IS NOT NULL OR json_extract(data, '$.status') = 'replied' OR ${BEST_SQL} >= 1 THEN 1 ELSE 0 END`;
const IN_RANGE = col => `julianday(${col}) >= julianday(?1)`;
// Fixed expressions only (never built from input).
const BREAKDOWNS = {
  country: "json_extract(data, '$.country')",
  segment: "json_extract(data, '$.segment')",
  score: "CAST(json_extract(data, '$.score') AS TEXT)",
  lang: "json_extract(data, '$.lang')",
  emailKind: "CASE json_extract(data, '$.emailKind') WHEN 'role' THEN 'office' WHEN 'named' THEN 'named' ELSE 'none' END",
  source: "CASE WHEN json_extract(data, '$.foundBy') LIKE 'upload:%' THEN json_extract(data, '$.foundBy') WHEN json_extract(data, '$.foundBy') = 'manual' THEN 'manual' ELSE 'daily run' END",
};

async function insightsData(db, rangeKey, nowMs = Date.now()) {
  const days = RANGES[rangeKey];
  const today = cairoDayOf(nowMs);
  const since = days ? new Date(cairoMidnight(addDay(today, -(days - 1)))).toISOString() : '1970-01-01T00:00:00Z';
  const one = (sql, ...p) => db.prepare(sql).bind(since, ...p).first();
  const all = async (sql, ...p) => (await db.prepare(sql).bind(since, ...p).all()).results;
  const N = v => Number(v) || 0;

  const h = await one(`SELECT
      SUM(CASE WHEN json_extract(data, '$.status') IS NOT 'manual' AND ${IN_RANGE("json_extract(data, '$.createdAt')")} THEN 1 ELSE 0 END) AS newLeads,
      SUM(CASE WHEN json_extract(data, '$.status') = 'drafted' THEN 1 ELSE 0 END) AS draftsWaiting,
      SUM(CASE WHEN ${IN_RANGE("json_extract(data, '$.approvedAt')")} THEN 1 ELSE 0 END) AS approved,
      SUM(CASE WHEN ${IN_RANGE("json_extract(data, '$.repliedAt')")} THEN 1 ELSE 0 END) AS replies
    FROM docs WHERE coll = 'leads'`);
  const sent = await one(`SELECT SUM(CASE WHEN json_extract(j.value, '$.manual') = 1 THEN 0 ELSE 1 END) AS agent, SUM(CASE WHEN json_extract(j.value, '$.manual') = 1 THEN 1 ELSE 0 END) AS manual
    FROM docs, json_each(docs.data, '$.sentLog') AS j WHERE docs.coll = 'leads' AND ${IN_RANGE("json_extract(j.value, '$.at')")}`);
  const rate = await one(`SELECT COUNT(*) AS emailed, SUM(${REPLIED_SQL}) AS replied FROM docs WHERE coll = 'leads'
    AND EXISTS (SELECT 1 FROM json_each(docs.data, '$.sentLog') AS j WHERE ${IN_RANGE("json_extract(j.value, '$.at')")})`);
  const deals = await one(`SELECT
      COUNT(DISTINCT CASE WHEN json_extract(data, '$.to') IN ('meeting_booked', 'demo_done', 'proposal_sent', 'won') THEN json_extract(data, '$.leadId') END) AS meetings,
      COUNT(DISTINCT CASE WHEN json_extract(data, '$.to') = 'won' THEN json_extract(data, '$.leadId') END) AS won
    FROM docs WHERE coll = 'activity' AND json_extract(data, '$.kind') = 'stage' AND ${IN_RANGE("json_extract(data, '$.at')")}`);

  // Funnel: schools the agent found in the range (manual leads are not "found"), by the furthest point each reached.
  const f = await one(`SELECT COUNT(*) AS found,
      SUM(CASE WHEN approvedAt IS NOT NULL OR hasSent = 1 THEN 1 ELSE 0 END) AS approved, SUM(hasSent) AS emailed, SUM(replied) AS replied,
      SUM(best >= 2) AS meeting, SUM(best >= 3) AS demo, SUM(best >= 4) AS proposal, SUM(best >= 5) AS won
    FROM (SELECT json_extract(data, '$.approvedAt') AS approvedAt, ${HAS_SENT_SQL} AS hasSent, ${REPLIED_SQL} AS replied, ${BEST_SQL} AS best
      FROM docs WHERE coll = 'leads' AND json_extract(data, '$.status') IS NOT 'manual' AND ${IN_RANGE("json_extract(data, '$.createdAt')")})`);

  const breakdowns = {};
  for (const [k, expr] of Object.entries(BREAKDOWNS)) {
    breakdowns[k] = (await all(`SELECT COALESCE(${expr}, '') AS key, COUNT(*) AS leads, SUM(${HAS_SENT_SQL}) AS emailed, SUM(${REPLIED_SQL}) AS replied
      FROM docs WHERE coll = 'leads' AND ${IN_RANGE("json_extract(data, '$.createdAt')")} GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 20`))
      .map(r => ({ key: String(r.key), leads: N(r.leads), emailed: N(r.emailed), replied: N(r.replied) }));
  }

  // Follow-up performance: leads emailed at each step in the range, and replies by the step the lead was on.
  const stepSent = await all(`SELECT json_extract(j.value, '$.step') AS step, COUNT(DISTINCT docs.id) AS n FROM docs, json_each(docs.data, '$.sentLog') AS j
    WHERE docs.coll = 'leads' AND ${IN_RANGE("json_extract(j.value, '$.at')")} GROUP BY 1`);
  const stepReplied = await all(`SELECT COALESCE(json_extract(data, '$.repliedStep'), 0) AS step, COUNT(*) AS n FROM docs
    WHERE coll = 'leads' AND ${IN_RANGE("json_extract(data, '$.repliedAt')")} GROUP BY 1`);
  const steps = [1, 2, 3].map(s => ({ step: s, emailed: N(stepSent.find(r => N(r.step) === s)?.n), replied: N(stepReplied.find(r => N(r.step) === s)?.n) }));
  const repliedUnknownStep = N(stepReplied.find(r => N(r.step) === 0)?.n);

  // Per day, last 30 Cairo days (whatever the range): emails by the agent, emails the owner sent himself, new leads.
  const since30 = new Date(cairoMidnight(addDay(today, -29))).toISOString();
  const perDay = new Map(Array.from({ length: 30 }, (_, i) => [addDay(today, i - 29), { day: addDay(today, i - 29), sent: 0, manual: 0, leads: 0 }]));
  const sentRows = (await db.prepare(`SELECT json_extract(j.value, '$.at') AS at, json_extract(j.value, '$.manual') AS manual FROM docs, json_each(docs.data, '$.sentLog') AS j
    WHERE docs.coll = 'leads' AND ${IN_RANGE("json_extract(j.value, '$.at')")}`).bind(since30).all()).results;
  for (const r of sentRows) { const d = perDay.get(cairoDayOf(Date.parse(r.at))); if (d) d[N(r.manual) === 1 ? 'manual' : 'sent']++; }
  const newRows = (await db.prepare(`SELECT json_extract(data, '$.createdAt') AS at FROM docs WHERE coll = 'leads' AND json_extract(data, '$.status') IS NOT 'manual' AND ${IN_RANGE("json_extract(data, '$.createdAt')")}`).bind(since30).all()).results;
  for (const r of newRows) { const d = perDay.get(cairoDayOf(Date.parse(r.at))); if (d) d.leads++; }

  const emailed = N(rate.emailed), replied = N(rate.replied);
  return {
    range: rangeKey, since: days ? addDay(today, -(days - 1)) : null, today,
    headline: {
      newLeads: N(h.newLeads), draftsWaiting: N(h.draftsWaiting), approved: N(h.approved), emailsSent: N(sent.agent), emailsSentByYou: N(sent.manual),
      replies: N(h.replies), leadsEmailed: emailed, leadsReplied: replied, replyRate: emailed ? Math.round((1000 * replied) / emailed) / 10 : null,
      meetings: N(deals.meetings), won: N(deals.won),
    },
    funnel: ['found', 'approved', 'emailed', 'replied', 'meeting', 'demo', 'proposal', 'won'].map(k => ({ key: k, n: N(f[k]) })),
    perDay: [...perDay.values()],
    breakdowns, followUps: { steps, repliedUnknownStep },
  };
}
