# Gitupcms Forms

A self-hosted backend for HTML forms. Point any form's `action` at your server and submissions land in your
admin panel and your email. No server code on your site, no API key in the page.

- Plain HTML posts, `fetch` with JSON replies, file uploads
- Spam: hidden honeypot field, link and duplicate checks, per-visitor rate limit, your own blocklist
- Email with Reply-To set to the sender, and a "mark as spam" link
- Signed webhooks, CSV export, search, a delivery log per submission
- Inbox with unread and starred, date range, sort, bulk actions; per-form analytics (per day, by site and country)
- Workspaces to group forms (one per client, say), ready-made form templates and React, Vue, Svelte, Webflow snippets
- Everything in a SQLite file on your server; uploaded files next to it

## Run it

Needs Node 22+. From npm, in a folder with your `.env` (see `.env.example`; the database goes in `data/`):

```sh
npx @gitupcms/forms   # HOST and PORT pick the address (default localhost:4321)
```

Or from source, with pnpm:

```sh
cp .env.example .env    # set BETTER_AUTH_URL and BETTER_AUTH_SECRET at least
pnpm install
pnpm build
node --env-file=.env dist/server/entry.mjs
```

Or with Docker:

```sh
docker build -t gitupcms-forms .
docker run -d -p 4321:4321 -v gitupcms-forms-data:/data --env-file .env gitupcms-forms
```

Put it behind HTTPS (Caddy, nginx…) at the address in `BETTER_AUTH_URL`. Behind a reverse proxy, set
`TRUST_PROXY=1` so rate limits see visitors' addresses; only when the proxy overwrites `X-Forwarded-For`.

Optional: Google sign-in (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`), Cloudflare Turnstile on the sign-in page
(`TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY`). For a hosted plan: `MONTHLY_SUBMISSION_LIMIT`, `MAX_FORMS`, and
`BRANDING=1` (a "Powered by" line in emails and the thank-you page). **Usage** shows this month against the limits.

Open the address. The first account you create is the admin; after that only invited people can sign up
(**Team**). Back up the database file (`DB_PATH`, default `data/gitupcms-forms.db`) and the `files` folder.

## Connect a form

**Add form**, then copy its address from **Setup**:

```html
<form action="https://forms.example.com/f/YOUR_KEY" method="POST">
  <input name="email" type="email" required>
  <textarea name="message" required></textarea>
  <input name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">
  <button>Send</button>
</form>
```

Field names become the columns of the inbox. For files add `enctype="multipart/form-data"` (limit:
`MAX_UPLOAD_MB`, 10 files). Send with `fetch` and `Accept: application/json` to get `{"ok":true,"id":"…"}`
or `{"ok":false,"error":"…"}` instead of a page.

Special fields (not stored):

| Field | What |
| --- | --- |
| `_redirect` | Where to go after sending; same site only. The form's own setting wins. |
| `_subject` | Subject of the notification email |
| `_replyto` | Address replies go to (else the `email` field) |
| `_gotcha` | Hidden spam trap: a filled one means spam |

Spam gets the same reply as a real post, so bots learn nothing. It waits in the Spam tab and is never emailed.

**Settings → Allowed sites** limits who may post: those domains and their subdomains. Once set, posts without
an `Origin`/`Referer` (scripts, curl) are refused.

## Privacy

You are the controller of what your forms collect; this app helps you keep it lawful (GDPR, KVKK):

- What visitors send (fields, files, file names, subject, reply address) is encrypted with AES-256-GCM, with a key
  derived from `BETTER_AUTH_SECRET`. **Changing that secret makes stored submissions unreadable**, so keep it
  safe and back it up with the database.
- IP addresses are not stored: they live in memory for 10 minutes for rate limiting. Analytics keep only per-day counts by site and country.
- **Settings → Keep submissions** deletes old submissions (30–365 days). Spam is deleted after 30 days.
- **Data requests** finds everything stored about one email address across all forms, to export it (JSON;
  files are downloaded from each submission) or delete it.

Run it behind HTTPS. `legal/` has drafts of the privacy policy, DPA, terms and security page for the hosted
version.

## Webhooks

Each submission that is not spam is POSTed as JSON to the form's webhook, retried once on failure:

```json
{ "event": "submission.created", "form": { "key": "…", "name": "…" },
  "submission": { "id": "…", "createdAt": "…", "data": { … }, "files": [ … ], "url": "…" } }
```

The `X-Gitupcms-Signature` header is `t=<unix time>,v1=<hex>`. Verify it with the secret from the Delivery tab. The webhook can also send a Bearer token, Basic auth or a custom header.

```js
import { createHmac, timingSafeEqual } from "node:crypto";
const [, t, v1] = /t=(\d+),v1=([0-9a-f]+)/.exec(header);
const ok = Math.abs(Date.now() / 1000 - t) < 300 &&
  timingSafeEqual(Buffer.from(v1), Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex")));
```

## Per form

- **Delivery**: email recipients, auto-reply, webhook, Slack, Discord, Telegram, Google Sheets, Notion, Airtable, Zapier, Mailchimp (double opt-in).
- **Rules**: "when topic is sales, email sales@… with subject Lead: {{name}}", with a dry run.
- **Security**: allowed domains (with a localhost exception), CAPTCHA (Turnstile, hCaptcha, reCAPTCHA, Altcha), spam sensitivity, blocklist.
- **Settings**: pause the form, redirect, how long to keep submissions, or don't store them at all (email and channels only).
- **Email**: intro text on top, one email per submission or an hourly/daily digest, a preview of the email.
- **Analytics**: counted when a submission arrives, so deleting submissions keeps the numbers. Country needs a proxy
  that sends it (Cloudflare `CF-IPCountry`, Vercel) and `TRUST_PROXY=1`.

## API and MCP

Create a key under **API**. REST: `GET /api/v1/forms`, `GET /api/v1/forms/<key>/submissions?status=&q=&page=`,
`GET|PATCH|DELETE /api/v1/submissions/<id>`, `POST /api/v1/forms/<key>/rules/test`, all with `Authorization: Bearer gf_…`.
MCP (Streamable HTTP, JSON replies) at `/mcp` with the same header; tools: list_forms, get_form, list_submissions,
get_submission, set_submission_status, delete_submission, test_rules.

## Code

| Path | What |
| --- | --- |
| `src/plugins/forms/api/` | The public endpoint `/f/<key>` and the email "mark as spam" link |
| `src/plugins/forms/lib/` | Parsing, spam scoring, storage, email and webhook delivery, CSV |
| `src/pages/`, `src/components/` | Admin panel and its API |
| `src/lib/` | Admin sign-in, team, database, SMTP (shared with Gitupcms comments) |

```sh
pnpm dev     # http://localhost:4321
pnpm check   # types
pnpm test
```
