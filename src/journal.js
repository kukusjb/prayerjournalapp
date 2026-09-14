import { json, authenticate } from "./utils.js";

export async function handleJournalGet(request, env) {
  const userId = await authenticate(request, env);
  if (!userId) return json({ error: "Not signed in." }, 401);

  const row = await env.DB.prepare("SELECT data FROM journal_data WHERE user_id = ?").bind(userId).first();
  return json({ data: row ? row.data : null });
}

export async function handleJournalPost(request, env) {
  const userId = await authenticate(request, env);
  if (!userId) return json({ error: "Not signed in." }, 401);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid body." }, 400);
  }
  if (typeof body.data !== "string") return json({ error: "Missing data." }, 400);

  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO journal_data (user_id, data, updated_at) VALUES (?, ?, ?) " +
    "ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
  ).bind(userId, body.data, now).run();

  return json({ ok: true });
}
