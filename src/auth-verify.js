import { json, randomToken, sha256Hex } from "./utils.js";

export async function handleVerify(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid request." }, 400);
  }

  const token = (body.token || "").trim();
  if (!token) return json({ error: "Missing token." }, 400);

  const db = env.DB;
  if (!db) return json({ error: "Database is not configured." }, 500);

  const link = await db.prepare("SELECT * FROM magic_links WHERE token = ?").bind(token).first();
  if (!link) return json({ error: "This link is invalid." }, 400);
  if (link.used) return json({ error: "This link has already been used. Request a new one." }, 400);
  if (new Date(link.expires_at) < new Date()) return json({ error: "This link has expired. Request a new one." }, 400);

  await db.prepare("UPDATE magic_links SET used = 1 WHERE token = ?").bind(token).run();

  const user = await db.prepare("SELECT id FROM users WHERE email = ?").bind(link.email).first();
  if (!user) return json({ error: "Account not found." }, 400);

  const sessionToken = randomToken();
  const sessionHash = await sha256Hex(sessionToken);
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  await db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(sessionHash, user.id, expiresAt, new Date().toISOString())
    .run();

  return json({ sessionToken, expiresAt });
}
