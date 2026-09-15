import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const players = sqliteTable("players", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  memberNo: text("member_no").notNull(),
  name: text("name").notNull(),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  christinRanking: integer("christin_ranking"),
  age: integer("age"),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  phoneCountryCode: text("phone_country_code").notNull().default("+45"),
  gender: text("gender", { enum: ["M", "K"] }).notNull(),
  selfLevel: text("self_level", { enum: ["A", "AB", "B", "BC", "C", "Begynder"] }).notNull(),
  adminLevel: text("admin_level", { enum: ["A", "AB", "B", "C"] }),
  role: text("role", { enum: ["player", "admin"] }).notNull().default("player"),
  pinHash: text("pin_hash").notNull(),
  suspendedEventId: integer("suspended_event_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("idx_players_member_no").on(t.memberNo),
  check("players_cr_range", sql`${t.christinRanking} IS NULL OR (typeof(${t.christinRanking}) = 'integer' AND ${t.christinRanking} BETWEEN 1 AND 9)`),
]);

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  playerId: integer("player_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("idx_sessions_player_id").on(t.playerId)]);

export const pinResetTokens = sqliteTable("pin_reset_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  playerId: integer("player_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("idx_pin_reset_tokens_player").on(t.playerId), index("idx_pin_reset_tokens_expires").on(t.expiresAt)]);

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  registrationOpensAt: text("registration_opens_at").notNull(),
  registrationClosesAt: text("registration_closes_at").notNull(),
  status: text("status", { enum: ["draft", "published", "cancelled"] }).notNull().default("draft"),
  publishedAt: text("published_at"),
  registrationOverride: text("registration_override", { enum: ["auto", "open", "closed"] }).notNull().default("auto"),
  importedKampplan: text("imported_kampplan").notNull().default(""),
  isTest: integer("is_test", { mode: "boolean" }).notNull().default(false),
  testActive: integer("test_active", { mode: "boolean" }).notNull().default(false),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("idx_events_date").on(t.date),
  check("events_registration_override", sql`${t.registrationOverride} IN ('auto', 'open', 'closed')`),
]);

export const signups = sqliteTable("signups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull(),
  playerId: integer("player_id").notNull(),
  availability: text("availability").notNull(),
  requestedHours: integer("requested_hours").notNull().default(1),
  signupOrder: integer("signup_order"),
  status: text("status", { enum: ["active", "waitlist", "cancelled"] }).notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  uniqueIndex("idx_signups_event_player").on(t.eventId, t.playerId),
  index("idx_signups_event_status").on(t.eventId, t.status),
  uniqueIndex("idx_signups_event_order").on(t.eventId, t.signupOrder),
]);

export const matchRequests = sqliteTable("match_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull(),
  creatorPlayerId: integer("creator_player_id").notNull(),
  invitedMemberNos: text("invited_member_nos").notNull(),
  acceptedPlayerIds: text("accepted_player_ids").notNull(),
  status: text("status", { enum: ["pending", "ready", "cancelled"] }).notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
}, (t) => [index("idx_match_requests_event_status").on(t.eventId, t.status)]);

export const matches = sqliteTable("matches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull(),
  court: integer("court").notNull(),
  startTime: text("start_time").notNull(),
  playerIds: text("player_ids").notNull(),
  locked: integer("locked", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("idx_matches_event_time").on(t.eventId, t.startTime, t.court)]);

export const substitutions = sqliteTable("substitutions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull(),
  matchId: integer("match_id").notNull(),
  outgoingPlayerId: integer("outgoing_player_id").notNull(),
  replacementPlayerId: integer("replacement_player_id"),
  status: text("status", { enum: ["searching", "unresolved", "replaced"] }).notNull().default("searching"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  uniqueIndex("idx_substitutions_match_outgoing").on(t.matchId, t.outgoingPlayerId),
  index("idx_substitutions_event_status").on(t.eventId, t.status),
]);

export const feedback = sqliteTable("feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  matchId: integer("match_id").notNull(),
  authorPlayerId: integer("author_player_id").notNull(),
  balance: text("balance", { enum: ["even", "uneven", "level_issue"] }).notNull(),
  subjectPlayerId: integer("subject_player_id"),
  direction: text("direction", { enum: ["stronger", "weaker"] }),
  comment: text("comment").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("idx_feedback_match_author").on(t.matchId, t.authorPlayerId)]);
