import { json, getSecret } from "./utils.js";

export async function handleEsv(request, env) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");

  if (!q) {
    return json({ error: "Missing verse reference." }, 400);
  }

  const apiKey = await getSecret(env.ESV_API_KEY);
  if (!apiKey) {
    return json({ error: "ESV_API_KEY is not configured on the server." }, 500);
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
    return json({ error: "Could not reach the ESV API." }, 502);
  }

  if (!resp.ok) {
    return json({ error: "ESV API request failed (" + resp.status + ")." }, resp.status);
  }

  const data = await resp.json();
  return json(data, 200);
}
