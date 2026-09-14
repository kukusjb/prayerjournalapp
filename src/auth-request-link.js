import { json, randomToken, getSecret } from "./utils.js";

export async function handleRequestLink(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid request." }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@") || email.length > 200) {
    return json({ error: "Enter a valid email address." }, 400);
  }

  const db = env.DB;
  if (!db) return json({ error: "Database is not configured." }, 500);

  let user = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  let userId;
  if (user) {
    userId = user.id;
  } else {
    userId = crypto.randomUUID();
    await db.prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)")
      .bind(userId, email, new Date().toISOString())
      .run();
  }

  const token = randomToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await db.prepare("INSERT INTO magic_links (token, email, expires_at, used, created_at) VALUES (?, ?, ?, 0, ?)")
    .bind(token, email, expiresAt, new Date().toISOString())
    .run();

  const origin = new URL(request.url).origin;
  const link = origin + "/?token=" + token;

  const resendKey = await getSecret(env.RESEND_API_KEY);
  if (!resendKey) return json({ error: "Email sending is not configured." }, 500);

  const fromAddress = (await getSecret(env.RESEND_FROM_ADDRESS)) || "Prayer Journal <onboarding@resend.dev>";

  let emailResp;
  try {
    emailResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + resendKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [email],
        subject: "Your Prayer Journal sign-in link",
        html:
          "<p>Tap the link below to open your Prayer Journal. This link expires in 15 minutes and can only be used once.</p>" +
          "<p><a href=\"" + link + "\">Open Prayer Journal</a></p>" +
          "<p style=\"color:#888;font-size:12px;\">If you didn't request this, you can ignore this email.</p>"
      })
    });
  } catch (e) {
    return json({ error: "Could not reach the email service." }, 502);
  }

  if (!emailResp.ok) {
    return json({ error: "Could not send the email." }, 502);
  }

  return json({ ok: true });
}
