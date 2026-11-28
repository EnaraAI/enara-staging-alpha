-- sales-agent v2: finds a lead's activity log and tasks without scanning every row. Safe to run more than once.
CREATE INDEX IF NOT EXISTS docs_lead_ref ON docs (coll, json_extract(data, '$.leadId'));
