-- sales-agent v2: the Ask tab's rate limit (30 messages per 10 minutes per session). Safe to run more than once.
CREATE TABLE IF NOT EXISTS chat_hits (session TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS chat_hits_session_at ON chat_hits (session, at);
