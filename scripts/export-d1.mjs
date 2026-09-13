import Database from "better-sqlite3";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const tables = ["players", "events", "signups", "match_requests", "matches", "substitutions", "feedback"];
const identifier = (value) => `"${value.replaceAll('"', '""')}"`;

// Data only: apply drizzle migrations to an EMPTY D1 database first.
// Plain INSERT deliberately fails on conflicting IDs instead of overwriting users.
export function exportD1(source, destination) {
  if (resolve(source) === resolve(destination)) throw new Error("Source and destination must differ.");
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try {
    const counts = {};
    const sql = db.transaction(() => {
      const statements = ["-- Private member data. Do not commit or publish this file.", "-- Import only into an empty database after applying migrations."];
      for (const table of tables) {
        const columns = db.prepare(`PRAGMA table_info(${identifier(table)})`).all();
        if (!columns.length) throw new Error(`Missing source table: ${table}`);
        const names = columns.map(c => identifier(c.name));
        const rows = db.prepare(`SELECT ${names.map(n => `quote(${n}) AS ${n}`).join(",")} FROM ${identifier(table)}`).all();
        counts[table] = rows.length;
        for (const row of rows) {
          statements.push(`INSERT INTO ${identifier(table)} (${names.join(",")}) VALUES (${columns.map(c => row[c.name]).join(",")});`);
        }
      }
      // Sessions belong to the previous host; users log in again with their existing PIN.
      return statements.join("\n") + "\n";
    })();
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, sql, { flag: "wx", mode: 0o600 });
    return counts;
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const source = process.argv[2] ?? process.env.DATABASE_FILE ?? ".data/app.db";
  const destination = process.argv[3] ?? ".data/d1-import.sql";
  console.log(JSON.stringify({ destination, counts: exportD1(source, destination) }));
}
