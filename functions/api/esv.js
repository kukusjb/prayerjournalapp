// Cloudflare Pages Function
// Lives at /api/esv on your site and keeps your ESV API key private.
// It receives a plain-text reference from the app (e.g. "John 3:16"),
// calls the real ESV API server-to-server with your secret key, and
// returns just the passage text back to the browser.
//
// Setup:
// 1. Get a free API key at https://api.esv.org/
// 2. In Cloudflare Pages: Project > Settings > Environment variables
//    add ESV_API_KEY = <your key> (for Production, and Preview if you want)
// 3. Redeploy. Your key is never exposed in the repo or to visitors.

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const q = url.searchParams.get("q");

  if (!q) {
    return jsonResponse({ error: "Missing verse reference." }, 400);
  }
  if (!env.ESV_API_KEY) {
    return jsonResponse({ error: "ESV_API_KEY is not configured on the server." }, 500);
  }

  let apiKey;
  try {
    // Secrets Store bindings expose the value via an async .get() call
    // rather than as a plain string.
    apiKey = await env.ESV_API_KEY.get();
  } catch (e) {
    return jsonResponse({ error: "Could not read ESV_API_KEY from Secrets Store." }, 500);
  }
  if (!apiKey) {
    return jsonResponse({ error: "ESV_API_KEY secret is empty." }, 500);
  }

  const params = new URLSearchParams({
    q,
    "include-headings": "false",
    "include-footnotes": "false",
    "include-verse-numbers": "false",
    "include-short-copyright": "false",
    "include-passage-references": "false"
  });

  let resp;
  try {
    resp = await fetch("https://api.esv.org/v3/passage/text/?" + params.toString(), {
      headers: { "Authorization": "Token " + apiKey }
    });
  } catch (e) {
    return jsonResponse({ error: "Could not reach the ESV API." }, 502);
  }

  if (!resp.ok) {
    return jsonResponse({ error: "ESV API request failed (" + resp.status + ")." }, resp.status);
  }

  const data = await resp.json();
  return jsonResponse(data, 200);
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
