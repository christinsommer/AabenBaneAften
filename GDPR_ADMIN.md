# Privacy administration and newsletters

These workflows require the administrator role on the server; SuperAdmin also has them. See [role boundaries](SUPERADMIN.md). This is an application guide, not a legal assessment of the club's obligations.

## Review inactive profiles

The privacy administration view remains available without upcoming playing dates. It identifies documented inactivity of 24 months and unknown legacy activity. The legacy date 2026-09-25 with `activity_known=0` is a migration baseline, not evidence of a visit. No automatic profile deletion occurs.

1. Review activity evidence and earlier decisions.
2. Use “Kontakt medlem” to prepare email, SMS, or a call. Opening a link does not record that contact took place.
3. After actual contact, record a short relevant note using the contact-confirmation action. Actor and time are stored.
4. “Behold profil” requires a reason and a future review date; it does not change the last-activity date.
5. Use the pending-closure status while a request is unresolved.
6. Review closure blockers and consequences, then explicitly confirm “Slet/anonymisér profil”.

Recorded contact awaiting an answer is not a completed retention decision. Consider individual closure requests separately from the inactivity threshold; 24 months is an application workflow rule, not a universal legal deadline.

## Controlled profile closure

Closure replaces the display name with `NN <internal-id>` and membership number with `closed-<internal-id>`. A later registration can reuse the original membership number but receives a new internal identity.

Playing history, CR, and the existing CR review timestamp remain. Contact information, login credentials, age data, and spouse references are removed; sessions and reset credentials are revoked. Newsletter references and relevant free-text fields are cleaned according to the service's closure procedure. The closed profile is excluded from ordinary member/CR editing.

Administrator accounts, upcoming participation, in-progress mail, and identifying newsletter text can block closure. Historical matches and registrations are retained. Imported full names are replaced when matching is unambiguous; unreadable plans and duplicate names require investigation. Abbreviations, arbitrary free text, exported plans, external mail archives, and backups require separate review.

This is pseudonymization, not guaranteed anonymity. Stable IDs and historical relationships can still identify a person. Direct physical deletion is blocked by database triggers; use the controlled workflow.

## Newsletter workflow

Members opt in themselves. Administrators cannot subscribe someone else. A changed email address requires fresh consent for that address. Necessary service mail, such as PIN reset, is independent of newsletter consent.

1. Create a draft. The suggestion feature uses a local template and upcoming dates, not an external AI service.
2. Edit the subject/body, save, and preview the plain-text message.
3. Review eligible recipients. Only open profiles with valid consent for the current email revision qualify.
4. Confirm the recipient count when preparing the dispatch. Another dispatch within 30 days requires additional confirmation; this is a product rule.
5. Send individually. The server checks consent again before sending, without exposing other recipients' addresses.
6. Review the archive and per-recipient state. “Kopiér som ny” creates a separate draft and preserves the original dispatch.

`sent` means accepted by the provider, not proven inbox delivery. Failed/uncertain/sending states require investigation before retrying; this workflow does not automatically replay them. Its behavior differs from the shared transactional email helper's bounded retries.

Personal preference links work without login, but opening a link changes nothing. The member explicitly chooses unsubscribe/pause. Do not paste tokens into tickets, logs, or shared documents.

## Sending configuration

Newsletter sending requires both `RESEND_API_KEY` and `NEWSLETTER_ENABLED=true` in the selected environment. Disabling newsletters does not disable transactional email. Configuration in the repository does not prove Production is enabled.

## Related guidance

- [Data model](DATAMODEL.md)
- [Privacy implementation record](GDPR_SLUTRAPPORT.md)
- [Backup and recovery](GDPR_BACKUP.md)
- [Email delivery](docs/email-delivery.md)
