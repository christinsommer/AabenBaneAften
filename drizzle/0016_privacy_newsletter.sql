CREATE TABLE privacy_documents (document_type TEXT NOT NULL, version TEXT NOT NULL, content TEXT NOT NULL, content_hash TEXT NOT NULL, published_at TEXT NOT NULL, PRIMARY KEY(document_type,version));
--> statement-breakpoint
CREATE TRIGGER privacy_document_immutable BEFORE UPDATE ON privacy_documents BEGIN SELECT RAISE(ABORT,'Document versions are immutable'); END;
--> statement-breakpoint
CREATE TABLE privacy_acknowledgements (player_id INTEGER NOT NULL REFERENCES players(id), document_type TEXT NOT NULL, version TEXT NOT NULL, acknowledged_at TEXT NOT NULL, source TEXT NOT NULL, PRIMARY KEY(player_id,document_type,version));
--> statement-breakpoint
CREATE TABLE profile_privacy (player_id INTEGER PRIMARY KEY REFERENCES players(id), last_active_at TEXT NOT NULL DEFAULT '2026-09-25T00:00:00.000Z', activity_known INTEGER NOT NULL DEFAULT 0, activity_type TEXT NOT NULL DEFAULT 'legacy-default', closed_at TEXT, review_status TEXT NOT NULL DEFAULT 'pending', review_after TEXT, last_contact_at TEXT, contact_method TEXT);
--> statement-breakpoint
INSERT INTO profile_privacy(player_id) SELECT id FROM players;
--> statement-breakpoint
CREATE TRIGGER privacy_new_player AFTER INSERT ON players BEGIN INSERT INTO profile_privacy(player_id,last_active_at,activity_known,activity_type) VALUES(NEW.id,NEW.created_at,1,'registration'); END;
--> statement-breakpoint
CREATE TABLE privacy_review_events (id TEXT PRIMARY KEY, player_id INTEGER NOT NULL, action TEXT NOT NULL, method TEXT, note TEXT, occurred_at TEXT NOT NULL, actor_id INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE newsletter_preferences (player_id INTEGER PRIMARY KEY REFERENCES players(id), status TEXT NOT NULL DEFAULT 'never' CHECK(status IN ('never','subscribed','paused','unsubscribed')), paused_until TEXT, email_revision TEXT NOT NULL, consent_id TEXT, changed_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE newsletter_events (id TEXT PRIMARY KEY, player_id INTEGER NOT NULL, email TEXT, action TEXT NOT NULL, occurred_at TEXT NOT NULL, source TEXT NOT NULL, version TEXT, checkbox_text TEXT, help_text TEXT);
--> statement-breakpoint
CREATE TABLE newsletter_tokens (token_hash TEXT PRIMARY KEY, player_id INTEGER NOT NULL, email_revision TEXT NOT NULL, consent_id TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT);
--> statement-breakpoint
CREATE TABLE newsletter_drafts (id TEXT PRIMARY KEY, subject TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, actor_id INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE newsletter_dispatches (id TEXT PRIMARY KEY, subject TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, actor_id INTEGER NOT NULL, frequency_override INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE newsletter_recipients (dispatch_id TEXT NOT NULL REFERENCES newsletter_dispatches(id), player_id INTEGER NOT NULL, email TEXT, consent_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','sending','sent','failed','uncertain','excluded')), sent_at TEXT, provider_id TEXT, attempt_at TEXT, PRIMARY KEY(dispatch_id,player_id));
--> statement-breakpoint
CREATE INDEX privacy_activity_date ON profile_privacy(last_active_at);
--> statement-breakpoint
CREATE INDEX newsletter_event_player ON newsletter_events(player_id,occurred_at);
--> statement-breakpoint
CREATE TRIGGER privacy_email_change AFTER UPDATE OF email ON players WHEN OLD.email <> NEW.email BEGIN
 UPDATE newsletter_preferences SET status='never',consent_id=NULL,email_revision=lower(hex(randomblob(32))),paused_until=NULL,changed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE player_id=NEW.id;
 UPDATE newsletter_tokens SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE player_id=NEW.id;
 INSERT INTO newsletter_events(id,player_id,action,occurred_at,source) VALUES(lower(hex(randomblob(16))),NEW.id,'email-change',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'profile');
END;
--> statement-breakpoint
CREATE TRIGGER privacy_closed_player BEFORE UPDATE ON players WHEN EXISTS(SELECT 1 FROM profile_privacy WHERE player_id=OLD.id AND closed_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Closed profiles cannot be edited'); END;
--> statement-breakpoint
CREATE TRIGGER privacy_no_direct_delete BEFORE DELETE ON players BEGIN SELECT RAISE(ABORT,'Use controlled privacy closure'); END;
--> statement-breakpoint
CREATE TRIGGER privacy_no_closed_session BEFORE INSERT ON sessions WHEN EXISTS(SELECT 1 FROM profile_privacy WHERE player_id=NEW.player_id AND closed_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Closed profile'); END;
--> statement-breakpoint
CREATE TRIGGER privacy_no_closed_signup BEFORE INSERT ON signups WHEN EXISTS(SELECT 1 FROM profile_privacy WHERE player_id=NEW.player_id AND closed_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Closed profile'); END;
