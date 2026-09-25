import { json, getSecret } from "./utils.js";

export async function handleEsv(request, env) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim().replace(/[–—]/g, "-");

  if (!q) {
    return json({ error: "Missing verse reference." }, 400);
  }

  const guided = url.searchParams.get("guided") === "1";
  let selected;
  if (guided) {
    const match = q.match(/^([1-3]?[A-Za-z ]+) (\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/);
    if (!match) return json({ error: "Choose a book, chapter, and verses." }, 400);
    const [, book, chapter, start, end] = match;
    selected = { chapter: Number(chapter), start: Number(start), end: Number(end || start) };
    const limit = { "Haggai":19, "Obadiah":10, "Philemon":12, "2 John":6, "3 John":7, "Jude":12 }[book] || 20;
    if (!selected.chapter || !selected.start || selected.end < selected.start || selected.end-selected.start+1 > limit) return json({ error: "Choose a passage of 1 to " + limit + " verses in order." }, 400);
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
    const range = data.parsed?.[0];
    if (data.parsed?.length !== 1 || !range || range.length !== 2 || !range.every(Number.isInteger) || Math.floor(range[0]/1000) !== Math.floor(range[1]/1000) || Math.floor(range[0]/1000)%1000 !== selected.chapter || range[0]%1000 !== selected.start || range[1]%1000 !== selected.end) return json({ error: "Those verses were not found. Please check the selection." }, 400);
  }
  return json(data, 200);
}
