import { handleEsv } from "./esv.js";
import { handleRequestLink } from "./auth-request-link.js";
import { handleVerify } from "./auth-verify.js";
import { handleJournalGet, handleJournalPost } from "./journal.js";
import { handleContact } from "./contact.js";
import { handleDeleteAccount } from "./account.js";
import { json } from "./utils.js";
import { handleJourneys } from "./journeys.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (path === "/api/journeys" || path.startsWith("/api/journeys/")) {
        return await handleJourneys(request, env);
      }
      if (path === "/api/esv" && method === "GET") {
        return await handleEsv(request, env);
      }
      if (path === "/api/auth/request-link" && method === "POST") {
        return await handleRequestLink(request, env);
      }
      if (path === "/api/auth/verify" && method === "POST") {
        return await handleVerify(request, env);
      }
      if (path === "/api/journal" && method === "GET") {
        return await handleJournalGet(request, env);
      }
      if (path === "/api/journal" && method === "POST") {
        return await handleJournalPost(request, env);
      }
      if (path === "/api/contact" && method === "POST") {
        return await handleContact(request, env);
      }
      if (path === "/api/account/delete" && method === "POST") {
        return await handleDeleteAccount(request, env);
      }
    } catch (e) {
      return json({ error: "Server error." }, 500);
    }

    // Anything else falls through to the static site (index.html, etc.)
    return env.ASSETS.fetch(request);
  }
};
