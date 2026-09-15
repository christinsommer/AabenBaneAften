import { getCloudflareContext } from "@opennextjs/cloudflare";
import release from "../../../lib/release-info.json";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const db = getCloudflareContext().env.DB;
    await db.prepare("SELECT imported_kampplan FROM events LIMIT 0").all();
    await db.prepare("SELECT birth_year FROM players LIMIT 0").all();
    await db.prepare("SELECT token_hash FROM pin_reset_tokens LIMIT 0").all();
    return Response.json({ ok: true, release: release.id }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
