import { authenticate, json } from "./utils.js";

const textFields = ["title", "problem", "questionToGod", "scripture", "scriptureApplication", "specificRequest", "belief", "plannedActions", "godActions", "nextActions"];
const yesNoFields = ["abiding", "godFirst", "inWord", "willingToWait", "spiritLeading", "promiseAccepted"];
const uses = ["power", "blessing", "character", "prayer"];
function validDate(value) {
  return value === "" || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
}
export function validateJourney(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid journey.");
  const modern = input.formatVersion === 3;
  const data = {};
  for (const key of textFields) {
    if (typeof input[key] !== "string" || input[key].length > (key === "title" ? 160 : 10000)) throw new Error("Please shorten or check your answers.");
    data[key] = input[key];
  }
  for (const key of yesNoFields) {
    if (!["", "yes", "no"].includes(input[key])) throw new Error("Choose Yes or No, or leave the question unanswered.");
    data[key] = input[key];
  }
  if (!Array.isArray(input.possibleUses) || input.possibleUses.length > (modern ? 6 : 4) || input.possibleUses.some(v => !(modern ? [...uses, "serve", "other"] : uses).includes(v))) throw new Error("Invalid selections.");
  data.possibleUses = [...new Set(input.possibleUses)];
  if (!Number.isInteger(input.step) || input.step < 1 || input.step > (modern ? 7 : 6)) throw new Error("Invalid step.");
  data.step = input.step;
  if (!(modern ? ["in_progress", "praying", "answered"] : ["in_prayer", "waiting", "answered"]).includes(input.status)) throw new Error("Invalid status.");
  data.status = input.status;
  data.frequency = input.frequency === undefined ? "daily" : input.frequency;
  if (!["daily", "weekly", "none"].includes(data.frequency)) throw new Error("Choose Daily, Weekly, or Guide only.");
  data.category = input.category === undefined ? "" : input.category;
  if (typeof data.category !== "string" || data.category.length > 160) throw new Error("Invalid prayer category.");
  data.lastPrayed = input.lastPrayed === undefined ? "" : input.lastPrayed;
  if (!validDate(data.lastPrayed)) throw new Error("Invalid prayed date.");
  for (const key of ["submittedDate", "answeredDate"]) {
    if (!validDate(input[key])) throw new Error("Enter a valid date.");
    data[key] = input[key];
  }
  if (!["in_prayer", "in_progress"].includes(data.status) && !data.submittedDate) throw new Error("Enter the date submitted to God.");
  if (data.status === "answered" && !data.answeredDate) throw new Error("Enter the date answered.");
  if (data.answeredDate && !data.submittedDate) throw new Error("Enter the date submitted to God first.");
  if (data.answeredDate && data.answeredDate < data.submittedDate) throw new Error("The answered date cannot precede the submitted date.");
  if (modern) {
    data.formatVersion = 3;
    for (const key of ["surrender", "glorifyOther", "lessons", "scriptureReference", "scriptureBook", "scriptureChapter", "scriptureStart", "scriptureEnd"]) {
      const value = input[key] ?? "";
      if (typeof value !== "string" || value.length > (key.startsWith("scripture") ? 160 : 10000)) throw new Error("Please shorten or check your answers.");
      data[key] = value;
    }
    if (!["guide", "review", "answer"].includes(input.view)) throw new Error("Invalid journey screen.");
    data.view = input.view;
    data.legacy = input.legacy === true;
    if (data.status !== "in_progress" && (!data.title.trim() || !data.submittedDate)) throw new Error("Add a prayer name and date committed to prayer.");
    if (data.status === "answered" && !data.legacy && !data.godActions.trim()) throw new Error("Describe how God answered before saving the answer.");
  } else if (input.formatVersion !== undefined) throw new Error("Please reload Guided Prayer to use the current version.");
  return data;
}
function privateJson(body, status = 200) {
  const response = json({ ...body, journeyFormat: 3 }, status);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
function unpack(row) {
  return { id: row.id, data: JSON.parse(row.data), version: row.version, createdAt: row.created_at, updatedAt: row.updated_at };
}
export async function handleJourneys(request, env) {
  const userId = await authenticate(request, env);
  if (!userId) return privateJson({ error: "Your session expired. Please sign in again before saving." }, 401);
  const match = new URL(request.url).pathname.match(/^\/api\/journeys(?:\/([a-zA-Z0-9-]{1,80}))?$/);
  if (!match) return privateJson({ error: "Not found." }, 404);
  const id = match[1];
  if (request.method === "GET") {
    if (id) {
      const row = await env.DB.prepare("SELECT * FROM prayer_journeys WHERE id = ? AND user_id = ?").bind(id, userId).first();
      return row ? privateJson({ journey: unpack(row) }) : privateJson({ error: "Journey not found." }, 404);
    }
    const rows = await env.DB.prepare("SELECT * FROM prayer_journeys WHERE user_id = ? ORDER BY updated_at DESC, id").bind(userId).all();
    return privateJson({ journeys: rows.results.map(unpack) });
  }
  if (request.method === "DELETE" && id) {
    const versionHeader = request.headers.get("If-Match");
    if (!versionHeader || !/^[1-9]\d*$/.test(versionHeader) || !Number.isSafeInteger(Number(versionHeader))) return privateJson({ error: "Reload My Prayer Journeys before deleting this prayer." }, 400);
    const removed = await env.DB.prepare("DELETE FROM prayer_journeys WHERE id = ? AND user_id = ? AND version = ? RETURNING id")
      .bind(id, userId, Number(versionHeader)).first();
    if (removed) return privateJson({ ok: true });
    const owned = await env.DB.prepare("SELECT id FROM prayer_journeys WHERE id = ? AND user_id = ?").bind(id, userId).first();
    return privateJson({ error: owned ? "This journey changed on another device. Cancel and reload My Prayer Journeys to review it before deleting." : "Journey not found." }, owned ? 409 : 404);
  }
  if (!((request.method === "POST" && !id) || (request.method === "PUT" && id))) return privateJson({ error: "Method not allowed." }, 405);
  if (Number(request.headers.get("Content-Length")) > 150000) return privateJson({ error: "Journey is too large." }, 413);
  let body, data;
  try {
    const raw = await request.text();
    if (raw.length > 150000) return privateJson({ error: "Journey is too large." }, 413);
    body = JSON.parse(raw);
    data = validateJourney(body.data);
  } catch (e) { return privateJson({ error: e instanceof SyntaxError ? "Invalid request." : e.message }, 400); }
  const now = new Date().toISOString();
  if (!id) {
    // Client-generated ID makes retries safe when the first response is lost.
    if (typeof body.id !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(body.id)) return privateJson({ error: "Invalid journey ID." }, 400);
    await env.DB.prepare("INSERT INTO prayer_journeys (id, user_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING")
      .bind(body.id, userId, JSON.stringify(data), now, now).run();
    const row = await env.DB.prepare("SELECT * FROM prayer_journeys WHERE id = ? AND user_id = ?").bind(body.id, userId).first();
    return row ? privateJson({ journey: unpack(row) }, 201) : privateJson({ error: "Could not create journey." }, 409);
  }
  if (!Number.isInteger(body.version) || body.version < 1) return privateJson({ error: "Missing journey version." }, 400);
  const previous = await env.DB.prepare("SELECT * FROM prayer_journeys WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (previous && JSON.parse(previous.data).formatVersion >= 2 && data.formatVersion !== 3) return privateJson({ error: "Reload Guided Prayer before editing. Your saved answers have been preserved." }, 409);
  const row = await env.DB.prepare("UPDATE prayer_journeys SET data = ?, updated_at = ?, version = version + 1 WHERE id = ? AND user_id = ? AND version = ? RETURNING *")
    .bind(JSON.stringify(data), now, id, userId, body.version).first();
  if (row) return privateJson({ journey: unpack(row) });
  const owned = await env.DB.prepare("SELECT id FROM prayer_journeys WHERE id = ? AND user_id = ?").bind(id, userId).first();
  return privateJson({ error: owned ? "This journey changed on another device. Copy any unsaved answers, then reload the saved journey." : "Journey not found." }, owned ? 409 : 404);
}
