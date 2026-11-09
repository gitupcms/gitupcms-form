# Security

Last updated: {{EFFECTIVE_DATE}}

Gitupcms Forms is open source (https://github.com/gitupcms/gitupcms-forms): you can read exactly how your
submissions are handled, and run it on your own server instead of ours.

## Encryption

- **In transit:** every connection uses HTTPS (TLS 1.2 or newer). Plain HTTP is redirected.
- **At rest, in the application:** what your visitors send (every field, the email subject and reply address,
  uploaded files and their names) is encrypted with AES-256-GCM before it is written. A copy of the database
  or of the file storage is unreadable without the key, which is kept outside both.
- **At rest, on disk:** the servers' disks and backups are encrypted as well.
- Webhook signing secrets are stored encrypted. Admin passwords are hashed, never stored.

## What we keep, and for how long

- **IP addresses are not stored with submissions.** They are held in memory for up to 10 minutes to limit how
  often one visitor can post, then forgotten. Our web server logs keep IP addresses for {{LOG_DAYS}} days to
  investigate attacks.
- **Spam** is deleted automatically after 30 days and is never emailed or sent to webhooks.
- **Submissions** are kept until you delete them, or for the period you choose per form (30, 90, 180 or 365
  days), after which they are deleted with their files.
- **Deleting** a submission, a form or your account removes the data at once; backups containing it expire
  within {{BACKUP_DAYS}} days.
- **Data requests:** find, export and delete everything stored about one email address from the dashboard.

## Where the data is

All customer data is stored and processed in the European Union ({{REGION}}). Subprocessors are listed in
Annex 3 of the [DPA](/legal/dpa).

## Protecting the service

- Spam scoring with a honeypot field, link and duplicate checks, your own blocklist and per-visitor rate limits.
- Forms can be limited to your own domains.
- Uploaded files are only ever served as downloads, so a malicious file cannot run in your browser.
- Webhooks are signed (HMAC-SHA256 with a timestamp) so you can verify they came from us.
- Admin sessions use secure, HTTP-only cookies; requests that change data must come from the dashboard itself.
- Only a small number of named staff can access production systems, and only to run the service or when you
  ask for support.

## Incidents

If a breach affects your data we tell you without undue delay, and within 48 hours of learning of it, so you
can meet your own 72-hour duty to notify the authorities (GDPR Art. 33, KVKK Art. 12).

## Reporting a vulnerability

Email {{SECURITY_EMAIL}}. We reply within 2 working days. Please give us time to fix the issue before
publishing it, and do not access other customers' data or disrupt the service while testing.
