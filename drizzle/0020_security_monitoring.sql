CREATE TABLE security_counters (
  bucket INTEGER NOT NULL,
  kind TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, kind)
);
CREATE TABLE security_role_events (
  id TEXT PRIMARY KEY NOT NULL,
  occurred_at INTEGER NOT NULL,
  actor_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  new_role TEXT NOT NULL
);
CREATE INDEX security_role_events_time ON security_role_events(occurred_at);
CREATE TABLE security_alert_deliveries (
  id TEXT PRIMARY KEY NOT NULL,
  sent_at INTEGER NOT NULL
);
CREATE TABLE operations_health (
  name TEXT PRIMARY KEY NOT NULL,
  succeeded_at INTEGER NOT NULL
);
