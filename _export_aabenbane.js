const Database = require("better-sqlite3");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const os = require("os");

const db = new Database(path.join(process.cwd(), ".data", "app.db"));
const event = db.prepare("SELECT id FROM events WHERE date = '2026-09-11' LIMIT 1").get();
if (!event) throw new Error("Ingen event fundet for 2026-09-11");

const rows = db.prepare(`
  SELECT
    p.member_no AS member_no,
    (p.first_name || ' ' || p.last_name) AS full_name,
    p.christin_ranking AS cr,
    s.requested_hours AS nHours,
    s.status,
    s.availability
  FROM signups s
  JOIN players p ON p.id = s.player_id
  WHERE s.event_id = ?
  ORDER BY p.member_no
`).all(event.id);

const maxSlots = Math.max(0, ...rows.map((r) => JSON.parse(r.availability || "[]").length));
const headers = ["Medlemsnr", "Fornavn Efternavn", "CR", "status", "nHours", "nPossible"];
for (let i = 1; i <= maxSlots; i++) headers.push(`slot_${i}`);
headers.push("szPossible");

const outputRows = rows.map((r) => {
  const arr = JSON.parse(r.availability || "[]");
  const out = {
    Medlemsnr: r.member_no,
    "Fornavn Efternavn": r.full_name,
    CR: r.cr ?? "",
    status: r.status,
    nHours: r.nHours,
    nPossible: arr.length,
  };
  for (let i = 0; i < maxSlots; i++) out[`slot_${i + 1}`] = arr[i] ?? "";
  out.szPossible = arr.join(";");
  return out;
});

const ws = XLSX.utils.json_to_sheet(outputRows, { header: headers, skipHeader: false });
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Tilmeldinger");
const downloadPath = path.join(os.homedir(), "Downloads", "ÅbenBane.xlsx");
XLSX.writeFile(wb, downloadPath);

console.log(JSON.stringify({
  output: downloadPath,
  rows: outputRows.length,
  columns: headers.length,
  headers,
  example: outputRows[0] ?? null,
}, null, 2));

db.close();
