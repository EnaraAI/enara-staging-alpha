CREATE TABLE IF NOT EXISTS docs (coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, PRIMARY KEY (coll, id));
CREATE TABLE IF NOT EXISTS login_fail (ip TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS login_fail_ip_at ON login_fail (ip, at);
CREATE TABLE IF NOT EXISTS chat_hits (session TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS chat_hits_session_at ON chat_hits (session, at);
CREATE INDEX IF NOT EXISTS docs_lead_ref ON docs (coll, json_extract(data, '$.leadId'));
