import { json, getSecret } from "./utils.js";

async function verifyTurnstile(token, secret, remoteip) {
  const form = new URLSearchParams();
  form.append("secret", secret);
  form.append("response", token);
  if (remoteip) form.append("remoteip", remoteip);

  let resp;
  try {
    resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form
    });
  } catch (e) {
    return false;
  }
  if (!resp.ok) return false;
  const result = await resp.json().catch(() => ({}));
  return !!result.success;
}

export async function handleContact(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid request." }, 400);
  }

  const name = (body.name || "").trim().slice(0, 200);
  const replyEmail = (body.email || "").trim().slice(0, 200);
  const message = (body.message || "").trim().slice(0, 5000);
  const turnstileToken = (body.turnstileToken || "").trim();

  if (!message) {
    return json({ error: "Enter a message before sending." }, 400);
  }
  if (!turnstileToken) {
    return json({ error: "Please complete the verification check." }, 400);
  }

  const turnstileSecret = await getSecret(env.TURNSTILE_SECRET_KEY);
  if (!turnstileSecret) return json({ error: "Verification is not configured." }, 500);

  const remoteip = request.headers.get("CF-Connecting-IP") || undefined;
  const verified = await verifyTurnstile(turnstileToken, turnstileSecret, remoteip);
  if (!verified) {
    return json({ error: "Verification failed. Please try again." }, 400);
  }

  const resendKey = await getSecret(env.RESEND_API_KEY);
  if (!resendKey) return json({ error: "Email sending is not configured." }, 500);

  const toAddress = await getSecret(env.CONTACT_EMAIL);
  if (!toAddress) return json({ error: "Contact address is not configured." }, 500);

  const fromAddress = (await getSecret(env.RESEND_FROM_ADDRESS)) || "Prayer Journal <onboarding@resend.dev>";
  const safeName = name || "Someone using the app";

  const html =
    "<p><strong>From:</strong> " + escapeHtml(safeName) +
    (replyEmail ? " (" + escapeHtml(replyEmail) + ")" : "") + "</p>" +
    "<p>" + escapeHtml(message).replace(/\n/g, "<br>") + "</p>";

  const payload = {
    from: fromAddress,
    to: [toAddress],
    subject: "Prayer Journal feedback from " + safeName,
    html
  };
  if (replyEmail) payload.reply_to = replyEmail;

  let resp;
  try {
    resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + resendKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    return json({ error: "Could not reach the email service." }, 502);
  }

  if (!resp.ok) {
    return json({ error: "Could not send the message." }, 502);
  }

  return json({ ok: true });
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
