ALTER TABLE sessions ADD COLUMN mfa_version TEXT;
--> statement-breakpoint
CREATE TABLE admin_mfa (
 player_id INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
 secret TEXT NOT NULL,
 version TEXT NOT NULL,
 last_step INTEGER NOT NULL DEFAULT -1,
 recovery_hashes TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE mfa_challenges (
 token_hash TEXT PRIMARY KEY,
 player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
 pin_hash TEXT NOT NULL,
 expected_version TEXT,
 secret TEXT,
 expires_at INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX idx_mfa_challenge_player ON mfa_challenges(player_id);
--> statement-breakpoint
CREATE TABLE trusted_devices (
 token_hash TEXT PRIMARY KEY,
 player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
 mfa_version TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_trusted_device_player ON trusted_devices(player_id);
--> statement-breakpoint
CREATE TRIGGER revoke_mfa_on_credentials AFTER UPDATE OF pin_hash,role,email ON players
WHEN OLD.pin_hash IS NOT NEW.pin_hash OR OLD.role IS NOT NEW.role OR OLD.email IS NOT NEW.email
BEGIN
 DELETE FROM sessions WHERE player_id=NEW.id;
 DELETE FROM trusted_devices WHERE player_id=NEW.id;
 DELETE FROM mfa_challenges WHERE player_id=NEW.id;
 UPDATE admin_mfa SET version=lower(hex(randomblob(32))) WHERE player_id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER remove_mfa_on_closure AFTER UPDATE OF closed_at ON profile_privacy
WHEN NEW.closed_at IS NOT NULL
BEGIN
 DELETE FROM admin_mfa WHERE player_id=NEW.player_id;
 DELETE FROM trusted_devices WHERE player_id=NEW.player_id;
 DELETE FROM mfa_challenges WHERE player_id=NEW.player_id;
END;
