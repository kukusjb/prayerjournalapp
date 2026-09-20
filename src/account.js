import { json, authenticate } from "./utils.js";

export async function handleDeleteAccount(request, env) {
  const userId = await authenticate(request, env);
  if (!userId) return json({ error: "Not signed in." }, 401);

  const user = await env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(userId).first();

  const statements = [
    env.DB.prepare("DELETE FROM prayer_journeys WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM journal_data WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId)
  ];
  if (user && user.email) {
    statements.push(env.DB.prepare("DELETE FROM magic_links WHERE email = ?").bind(user.email));
  }

  try {
    await env.DB.batch(statements);
  } catch (e) {
    return json({ error: "Could not delete your data. Please try again." }, 500);
  }

  return json({ ok: true });
}
