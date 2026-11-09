# Legal documents (Gitupcms Forms Cloud)

Drafts for the hosted service. Self-hosters are the controller of their own data and do not need these, but may
adapt them.

| File | Page | What |
| --- | --- | --- |
| `security.md` | /security | How data is protected; how to report a vulnerability |
| `privacy.md` | /privacy | Privacy policy (GDPR) and KVKK notice |
| `dpa.md` | /legal/dpa | Data processing agreement with customers, subprocessor list in Annex 3 |
| `terms.md` | /terms | Terms of service |

**These are drafts, not legal advice.** Have a lawyer review them before launch, especially:

- the company details, governing law and courts (`{{...}}` placeholders),
- international transfers: Turkey has no EU adequacy decision, so EU customers' data needs the EU Standard
  Contractual Clauses (and KVKK requires its own standard contract, notified to the KVKK Board within 5 working days),
- the subprocessor list, which must match the services the cloud really uses.

Every technical claim must stay true to the code. When the code changes, check these:

| Claim | Where in the code |
| --- | --- |
| Submissions and files encrypted with AES-256-GCM | `src/plugins/forms/lib/forms.ts` (`seal`, `saveSubmission`) |
| IP addresses not stored; kept in memory 10 minutes for rate limits | `forms.ts` (`countSend`), `api/submit.ts` |
| Per-form retention; spam deleted after 30 days | `forms.ts` (`purgeExpired`, `SPAM_DAYS`) |
| Find, export and delete a person's data | `src/pages/data-requests.astro` |

Placeholders: `{{COMPANY}}` legal name, `{{ADDRESS}}` registered address, `{{MERSIS}}` registry number,
`{{PRIVACY_EMAIL}}`, `{{SECURITY_EMAIL}}`, `{{LEGAL_EMAIL}}`, `{{REGION}}` (suggested: AWS eu-central-1, Frankfurt),
`{{BACKUP_DAYS}}` (suggested: 30), `{{LOG_DAYS}}` (suggested: 14), `{{PAYMENT_PROVIDER}}`, `{{GOVERNING_LAW}}`,
`{{COURTS}}`, `{{EFFECTIVE_DATE}}`.
