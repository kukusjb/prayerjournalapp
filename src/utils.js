export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input) {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Reads a value whether it's bound as a plain string variable
// or as a Secrets Store binding (which requires an async .get()).
export async function getSecret(binding) {
  if (binding === undefined || binding === null) return null;
  if (typeof binding === "string") return binding;
  if (typeof binding.get === "function") return await binding.get();
  return binding;
}

export async function authenticate(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const hash = await sha256Hex(token);
  const session = await env.DB
    .prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?")
    .bind(hash)
    .first();
  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) return null;
  return session.user_id;
}
