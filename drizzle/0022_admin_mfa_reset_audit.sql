CREATE TABLE security_mfa_events (
 id TEXT PRIMARY KEY NOT NULL,
 occurred_at INTEGER NOT NULL,
 actor_id INTEGER NOT NULL,
 target_id INTEGER NOT NULL,
 action TEXT NOT NULL CHECK(action='admin_reset'),
 identity_confirmed INTEGER NOT NULL CHECK(identity_confirmed=1)
);
--> statement-breakpoint
CREATE INDEX security_mfa_events_time ON security_mfa_events(occurred_at);
