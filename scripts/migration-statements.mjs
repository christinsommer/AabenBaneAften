// Drizzle separates complete statements explicitly. Splitting on semicolons
// would break triggers, whose BEGIN/END bodies contain their own semicolons.
export function migrationStatements(sql) {
  return sql.split('--> statement-breakpoint').map(statement => statement.trim()).filter(Boolean);
}
