import { json, getSecret } from "./utils.js";

export async function handleEsv(request, env) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim().replace(/[–—]/g, "-");

  if (!q) {
    return json({ error: "Missing verse reference." }, 400);
  }

  const guided = url.searchParams.get("guided") === "1";
  let requested;
  if (guided) {
    const match = q.match(/^([1-3]?[A-Za-z ]+) (\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/);
    if (!match) return json({ error: "Choose a book, chapter, and verse or verse range." }, 400);
    const [, book, chapter, first, last] = match;
    requested = { chapter: Number(chapter), first: Number(first), last: Number(last || first) };
    const maximum = { "Haggai": 19, "Obadiah": 10, "Philemon": 12, "2 John": 6, "3 John": 7, "Jude": 12 }[book] || 20;
    if (!requested.chapter || !requested.first || requested.last < requested.first || requested.last - requested.first + 1 > maximum) {
      return json({ error: "Choose a passage of 1 to " + maximum + " verses in order." }, 400);
    }
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
    "include-short-copyright": "true",
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
  if (guided) {
    const parsed = data.parsed;
    if (!Array.isArray(parsed) || parsed.length !== 1 || !Array.isArray(parsed[0]) || parsed[0].length !== 2 || !parsed[0].every(Number.isInteger)) return json({ error: "No passage found. Check the selected verses." }, 400);
    const [start, end] = parsed[0];
    if (Math.floor(start / 1000) !== Math.floor(end / 1000) || Math.floor(start / 1000) % 1000 !== requested.chapter || start % 1000 !== requested.first || end % 1000 !== requested.last) {
      return json({ error: "Those verses were not found in that chapter. Please check the verse range." }, 400);
    }
  }
  return json(data, 200);
}
