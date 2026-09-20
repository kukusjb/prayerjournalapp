# Prayer Guide update

This update is prepared and tested locally. It has not been uploaded to GitHub or deployed to Cloudflare, and no live database was changed.

## What was found

Reviewed repository: https://github.com/kukusjb/prayerjournalapp at commit `90ba8718756c280712609dfa25295a433167b73a`.

- **Frontend:** one page, `public/index.html`, with plain HTML, CSS and JavaScript. There is no React, build system or package manifest. Today, Prayer Lists and Guidance are panels switched by buttons. The page uses a cream background, green buttons, gold accents, serif headings and a narrow mobile layout.
- **Hosting:** `wrangler.jsonc` defines a Cloudflare Worker named `prayerjournalapp`, starting at `src/index.js`, with static files from `public` through the `ASSETS` binding. This is Workers with static assets, not a separate Pages configuration in the repository. Compatibility date: `2026-09-11`.
- **Database:** the existing `DB` binding points to `prayerjournal-db`. Existing code uses `users` (ID, email, creation date), `sessions` (hashed token, user ID, expiry, creation date), `magic_links` (token, email, expiry, used flag, creation date), and `journal_data` (user ID, JSON data, update date). No original schema or migrations were checked in. These columns are inferred from queries; live constraints and indexes were not inspected.
- **Sign-in:** Resend emails a one-time link lasting 15 minutes. Verification creates a roughly 90-day session. The browser keeps the session token in local storage and sends it as a Bearer token. The Worker hashes it and resolves the user through `sessions`. The existing `authenticate` helper is reused for every journey request.
- **Existing API:** GET `/api/esv`; POST `/api/auth/request-link`; POST `/api/auth/verify`; GET and POST `/api/journal`; POST `/api/contact`; POST `/api/account/delete`. ESV supplies Bible passages, and the contact form uses Turnstile and Resend.
- **Secrets:** existing Secrets Store bindings are ESV_API_KEY, RESEND_API_KEY, CONTACT_EMAIL, TURNSTILE_SECRET_KEY and RESEND_FROM_ADDRESS. No new secrets are needed.
- **Deployment:** there is no GitHub Actions workflow or deployment guide in the original repository. Wrangler can deploy the Worker and static assets together. The user's reported GitHub connection may deploy automatically, but its branch and settings are not visible in the repository.

## What changed

A Prayer Guide tab now opens a six-step, mobile-friendly wizard. The prompts and four checkboxes were transcribed from both pages of the supplied PDF. The original two phases are retained: “God Communicates Truth to Me” and “I Communicate Faith to God.” A short transition introduces step four.

Users can move Back and Continue, leave reflections unanswered, save manually or automatically, and reopen their saved step through My Prayer Journeys. Steps five and six preserve the belief, promise, actions and follow-up questions. Step six includes submitted/answered dates and In Prayer, Waiting or Answered status. Choosing Waiting requires a submitted date; choosing Answered requires both dates. Answered dates cannot precede submitted dates.

The new table stores one journey per row, linked to the existing user ID. Every list, read and update is restricted to the signed-in owner. Request bodies cannot choose another owner. The API never returns other users' journeys. Database administrators still have direct database access, as with the original journal.

Saves are serialized; version checks prevent silent overwrites from another device. Failed saves retain answers on screen, display an error and allow retry. If another device changed the journey, copy any unsaved answers before reloading the page to get the latest saved version. This is online saving, not an offline app: wait for “Saved to your account” before closing. The browser warns about unsaved changes, but mobile operating systems can still terminate a page.

Account export now includes `prayerJourneys`; account deletion also removes them. The privacy page mentions them. The new `/api/journeys` GET/POST and `/api/journeys/:id` GET/PUT routes return non-cacheable responses. API requests are explicitly routed through the Worker in Wrangler configuration.

Existing prayers and account tables are not replaced or rewritten.

## Publish without writing code

Do the database step **before** uploading app files, because a GitHub update may trigger your existing automatic deployment.

1. In Cloudflare, open the existing **prayerjournal-db** database under D1 and open its SQL console.
2. Open `migrations/0001_prayer_journeys.sql` from this update. Copy the complete SQL into the console and run it once. It only creates the new table and index; it does not delete or alter existing tables. Do not create a replacement database. If it fails, stop before uploading the app files and retain the error message for troubleshooting.
3. Unzip `prayer-guide-update.zip`. Open your GitHub repository and choose **Add file → Upload files** at the repository root. Upload the contents of the extracted folder, preserving the `public`, `src`, `migrations` and `tests` folders, plus `wrangler.jsonc` and this README. Do not upload the enclosing folder or the ZIP itself. This bundle includes only new or changed files; unrelated existing files must stay in place. Check that the preview updates `public/index.html` rather than creating an extra nested folder.
4. Commit the uploaded changes to the branch your existing Cloudflare connection deploys. Wait for its deployment to succeed. If no deployment starts, open the existing `prayerjournalapp` Worker in Cloudflare and check its connected repository/production branch and build settings. There is no frontend build command needed for this plain HTML app; the deploy command is `npx wrangler deploy`. Preserve the current database and secret bindings.
5. Open the live app and sign in. Open Prayer Guide, create a sample journey, enter answers, wait for a saved message, reload, and resume it. Move to step six and try a submitted date, Waiting status, then answered date and Answered status. Verify your existing Prayer Lists still open. A second account should not see the first account's journey.

The SQL console route does not add an entry to Wrangler's migration-history table. If you adopt Wrangler migrations later, this migration uses `IF NOT EXISTS` and can be safely run by Wrangler to record it. Avoid alternating migration methods for future schema changes.

## Command-line alternative

From the updated repository, with Node.js and an authorized Cloudflare login:

```text
npx wrangler login
npx wrangler d1 migrations apply prayerjournal-db --remote
npx wrangler deploy
```

Use this migration command instead of the SQL console step. Keep the migration before deployment. There are no new environment variables or account setup changes.

Official references: [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [D1 commands](https://developers.cloudflare.com/workers/wrangler/commands/d1/), [Workers static assets](https://developers.cloudflare.com/workers/static-assets/).

## Validation and limits

- `node --test tests/journeys.test.mjs` passed using Node 24's SQLite engine and a small D1-shaped adapter. It covers signed-out and expired sessions, separate owners, save/read/resume, safe creation retries, invalid input/dates, stale versions, and account deletion preserving the other owner's data. It runs the actual migration twice to check repeat safety.
- `tests/browser.mjs` passed in headless Microsoft Edge against the actual Worker handlers and a temporary SQLite database: all six steps, Back, reload/resume, save failure and retry, follow-up dates, answered status, JSON export, sign-out clearing and separate accounts. It checked 320px and 390px layouts and captured mobile and desktop screenshots.
- JavaScript syntax and whitespace checks passed. The mobile and desktop screenshots were visually reviewed.
- Tests do not use your live D1 database, real email delivery or Cloudflare runtime. A live smoke test after deployment is still necessary. The test database fixture reconstructs only existing columns used in the code; it is never a production migration.
- No original schema was invented for deployment. The update assumes the existing `users.id` column is a primary or unique key, as expected by the existing account model. The live schema was not available for verification.

To run the optional browser test on another computer, install Playwright locally without committing its dependencies (`npm install --no-save playwright`), install its Chromium browser (`npx playwright install chromium`), then run `node tests/browser.mjs`. Node 24 or later is required for the SQLite-based tests. `BROWSER_CHANNEL=msedge` can select an installed Edge browser. The screenshots contain only sample test answers.

If the release needs to be reversed, deploy the previous app version. Leave the new journeys table in place so users' new entries are preserved.
