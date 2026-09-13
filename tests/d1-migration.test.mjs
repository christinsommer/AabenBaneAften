import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { exportD1 } from "../scripts/export-d1.mjs";

test("D1 export preserves identities, PIN hashes, roles and relationships without sessions", () => {
  const directory = mkdtempSync(join(tmpdir(), "aabenbane-d1-"));
  const source = new Database(join(directory, "source.db"));
  const target = new Database(":memory:");
  try {
    for (const file of readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort()) {
      const sql = readFileSync(join("drizzle", file), "utf8");
      source.exec(sql);
      target.exec(sql);
    }
    source.exec("DELETE FROM events");
    target.exec("DELETE FROM events");
    source.prepare("INSERT INTO players (id,member_no,name,email,gender,self_level,role,pin_hash) VALUES (?,?,?,?,?,?,?,?)")
      .run(42,"13993","Test O'Connor\nÆØÅ","christinsommer@me.com","K","B","admin","salt:hash");
    source.exec("INSERT INTO events (id,date,registration_opens_at,registration_closes_at) VALUES (3,'2026-09-10','2026-09-09','2026-09-10')");
    source.exec("INSERT INTO signups (event_id,player_id,availability) VALUES (3,42,'[\"18:00\"]')");
    source.exec("INSERT INTO sessions (token_hash,player_id,expires_at) VALUES ('session-secret',42,'2099-01-01')");
    const destination = join(directory, "export.sql");
    const counts = exportD1(join(directory, "source.db"), destination);
    assert.equal(counts.players, 1);
    const sql = readFileSync(destination, "utf8");
    assert.ok(!sql.includes("session-secret"));
    target.exec(sql);
    for (const table of ["players","events","signups","matches","substitutions","feedback","match_requests"]) {
      assert.deepEqual(target.prepare(`SELECT * FROM ${table}`).all(), source.prepare(`SELECT * FROM ${table}`).all());
    }
    assert.equal(target.prepare("SELECT count(*) AS n FROM sessions").get().n, 0);
    assert.throws(() => target.exec(sql), /UNIQUE/);
    assert.throws(() => exportD1(join(directory, "source.db"), destination), /EEXIST/);
  } finally {
    source.close();
    target.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
