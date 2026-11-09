# Data processing agreement

Version 1.0, effective {{EFFECTIVE_DATE}}

This agreement ("DPA") is between the customer ("Customer", the controller) and {{COMPANY}}, {{ADDRESS}}
("Processor"). It forms part of the [Terms of Service](/terms) and applies when Customer accepts them. It meets
Article 28 GDPR, the UK GDPR, and KVKK Law No. 6698. Where this DPA conflicts with the Terms on data protection,
this DPA wins; where the Standard Contractual Clauses apply and conflict with this DPA, the Clauses win.

## 1. Scope

1.1 Processor processes the personal data in form submissions sent to Customer's forms ("Customer Data") only
to provide the service described in Annex 1, and only on Customer's documented instructions. The Terms, this
DPA and Customer's use and settings of the service are those instructions.

1.2 Processor tells Customer if it believes an instruction breaks data protection law.

1.3 Customer is responsible for having a legal basis for collecting the data, for informing the people who fill
in its forms, and for not sending data the Terms forbid (special categories, card numbers, government IDs).

## 2. Confidentiality and security

2.1 Everyone at Processor who can access Customer Data is bound by confidentiality.

2.2 Processor keeps at least the measures in Annex 2 in place and may improve them, but not weaken them.

## 3. Subprocessors

3.1 Customer authorises the subprocessors in Annex 3.

3.2 Processor announces a new or replacing subprocessor by email at least 30 days in advance. Customer may
object on reasonable data protection grounds within that time; if the parties cannot resolve it, Customer may
end the affected service and receive a refund of prepaid fees for the unused period.

3.3 Processor imposes the same data protection duties on each subprocessor and remains liable for them.

## 4. Data subjects' requests

4.1 The dashboard lets Customer find, export, correct and delete the data of any person by email address
(Data requests), and set how long submissions are kept.

4.2 Processor passes on to Customer, without undue delay, any request it receives from a data subject, and does
not answer it except to redirect the person to Customer.

## 5. Breaches

5.1 Processor notifies Customer without undue delay, and within 48 hours of becoming aware of a breach of
Customer Data, with what is known: what happened, the data and people affected, likely consequences and the
measures taken. It follows up as more is learned.

5.2 Processor helps Customer meet its duties to notify authorities and people (GDPR Art. 33–34, KVKK Art. 12).

## 6. Help with compliance

Processor gives reasonable help with Customer's data protection impact assessments and consultations with
authorities, as far as they concern the service.

## 7. Deletion and return

7.1 Customer can export its submissions (CSV, JSON) at any time while its account is active.

7.2 When Customer deletes data, a form or its account, Processor deletes the data from the live systems at
once and from backups within {{BACKUP_DAYS}} days, unless law requires keeping it.

## 8. Audits

Processor makes available the information needed to show compliance with this DPA. Once every 12 months, or
after a breach, Customer may audit by written questionnaire or, with 30 days' notice and at its own cost, by an
independent auditor bound by confidentiality, without disrupting the service or seeing other customers' data.

## 9. International transfers

9.1 Customer Data is stored in the European Union ({{REGION}}).

9.2 Processor is established in Turkey, which has no EU adequacy decision. For Customers in the EEA, the UK and
Switzerland, transfers to Processor and onward transfers are governed by the EU Standard Contractual Clauses
(Commission Decision 2021/914), Module 2 (controller to processor), with the UK Addendum and Swiss amendments
where needed, which are incorporated by reference. Clause 7 (docking) applies; Clause 9(a) option 2 with the
notice period in section 3.2; Clause 11 optional language does not apply; Clauses 17 and 18: the law and courts
of Ireland. Annexes 1–3 of this DPA complete the Clauses' annexes.

9.3 For Customer Data from Turkey sent abroad, the parties use the KVKK standard contract (Art. 9), which
Processor notifies to the KVKK Board within 5 working days of signing.

## 10. Liability and term

Liability under this DPA follows the limits in the Terms, except where law does not allow them. This DPA lasts
as long as Processor processes Customer Data.

---

## Annex 1: The processing

| | |
| --- | --- |
| Subject and purpose | Receiving, storing, spam-filtering and delivering (email, webhook) submissions to Customer's forms |
| Duration | As long as the account exists, or the retention Customer sets per form |
| Data subjects | People who fill in Customer's forms |
| Categories of data | Whatever Customer's forms collect: typically name, email, phone, message, uploaded files; also the sending website and a spam score |
| Special categories | None allowed (Terms §4) |
| Not stored | IP addresses (held in memory up to 10 minutes for rate limiting) |

## Annex 2: Technical and organisational measures

- **Encryption:** TLS 1.2+ in transit. Submission fields, subjects, reply addresses, uploaded files and file names
  encrypted in the application with AES-256-GCM; disks and backups encrypted by the hosting provider.
- **Data minimisation:** no IP addresses stored; spam deleted after 30 days; per-form retention (30–365 days);
  duplicate detection uses a keyed hash.
- **Access control:** customer data reachable only through the authenticated dashboard; production access
  limited to named staff, with multi-factor authentication; least privilege.
- **Application security:** origin checks on every change, uploaded files served only as downloads with
  `nosniff`, signed webhooks, rate limiting, dependency updates, open-source code open to review.
- **Availability:** daily encrypted backups kept {{BACKUP_DAYS}} days; restore tested.
- **Monitoring and incidents:** server logs kept {{LOG_DAYS}} days; incident process with the 48-hour notice in §5.
- **Staff:** confidentiality obligations; access removed when someone leaves.

## Annex 3: Subprocessors

Fill in from the services the cloud actually uses; remove any it does not.

Destinations Customer turns on for a form (Slack, Discord, Telegram, Google Sheets, Notion, Airtable, webhooks, a
CAPTCHA provider) are not Processor's subprocessors: Customer chooses them, holds the contract with them, and
instructs Processor to send Customer Data there.

| Subprocessor | Purpose | Data | Location | Transfer safeguard |
| --- | --- | --- | --- | --- |
| Amazon Web Services EMEA SARL | Hosting, database, file storage, backups | All Customer Data (encrypted) | {{REGION}} | EU, no transfer |
| Amazon Web Services EMEA SARL (Amazon SES) | Sending notification emails | Submission content in emails, recipients | {{REGION}} | EU, no transfer |
| {{PAYMENT_PROVIDER}} | Payments | Customer billing data only (no Customer Data) | {{...}} | SCCs / EU-US DPF |
