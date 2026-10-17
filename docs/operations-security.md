# Sikkerhedsalarmer og backup

## Aktivering

1. Udgiv migration `0020_security_monitoring.sql` og appkoden via projektets normale releaseforløb. Migrationen tilføjer kun tabeller.
2. Tilføj følgende GitHub Actions secrets i repositoryet (aldrig i Git):
   - `CLOUDFLARE_ACCOUNT_ID`.
   - `OPERATIONS_CLOUDFLARE_API_TOKEN`: separat token med D1-læse/skriveadgang til den relevante konto; ingen Workers-deploy-, DNS- eller kontoadministration. Cloudflare begrænser ikke nødvendigvis D1-tokenet til én database: kontrollér tokenets faktiske rækkevidde.
   - `OPERATIONS_RESEND_API_KEY`: separat send-only nøgle til afsenderdomænet.
   - `BACKUP_ENCRYPTION_KEY`: 32 kryptografisk tilfældige bytes som 64 hextegn. Generér i en password manager og opbevar en separat recovery-kopi uden for GitHub/Cloudflare. Bevar gamle nøgler, indtil deres backups er udløbet.
3. Merge workflows til default branch. Kør først **Operations backup**, derefter **Security monitor** manuelt. Kontrollér, at begge er grønne, og at backup-artifact kan downloades og dekrypteres med recovery-kopien af nøglen.
4. Slå GitHub-notifikationer om fejlede Actions til for SuperAdmin. Workflows sender fejlalarmer til `christinsommer@me.com`, men kan ikke sende mail, hvis GitHub slet ikke starter dem, eller mailtjenesten fejler. Brug en uafhængig dead-man/heartbeat-monitor ved krav om garanteret opdagelse af total scheduler-nedetid. GitHub schedules kan være forsinkede; de er ikke realtidsalarmer.

## Overvågning

Kontrol planlagt hvert 15. minut, syv dages efterslæb opsamles. Kun afsluttede 15-minutters perioder behandles. En samlet mail pr. periode ved mindst:

- 10 mislykkede loginforsøg samlet på tværs af konti/IP'er.
- 1 blokering fra login-/PIN-nulstillingsbegrænsningen.
- 100 mails accepteret af mailtjenesten. Dette er en aktivitetsalarm, ikke en automatisk blokering. Genforsøg kan tælle igen.
- 1 administratorrolleændring; alarmen indeholder interne aktør-/mål-ID'er og ny rolle.

Der gemmes ingen PINs, sessionstokens, mailadresser eller rå IP-adresser i sikkerhedstabellerne. Tællere beholdes i otte dage, rollehistorik og alarmkvitteringer i 30 dage. Sletning udføres af monitoren. Efter en pause over syv dage skal Cloudflare-logs gennemgås særskilt. Alarmer genforsøges efter fejl; D1-kvitteringer og Resends idempotens begrænser dubletter. En crash mellem levering og kvittering kan stadig give dublet efter udbyderens idempotensfrist.

Loggen `security_record_failed` i Cloudflare betyder, at registrering fejlede. Appens brugerhandling fortsætter for at undgå dobbelt afsendelse. Denne fejl kan derfor medføre manglende sikkerhedshændelser; overvåg også Worker-fejl. Lokale udviklingsdata overvåges ikke af workflows.

## Backup

Dagligt kl. 02:23 UTC (03:23 dansk vintertid / 04:23 sommertid). D1 eksporteres, krypteres med AES-256-GCM, læses og dekrypteres igen og gendannes i isoleret SQLite. Integritet, fremmednøgler, migrationsbevarelse og gentagelighed kontrolleres af de eksisterende backupværktøjer. Kun den krypterede SQL-fil uploades som GitHub artifact, opbevaret 30 dage. Midlertidige SQL-/SQLite-filer fjernes efter kørslen.

Backup markeres først som lykkedes efter artifact-upload. Monitoren alarmerer ved manglende succes i 36 timer. Den daglige kopi giver op til ca. ét døgn mellem kopier; undersøg D1 Time Travel for kortere gendannelsesintervaller. Artifact og recovery-nøgle skal begge være tilgængelige ved et Cloudflare-kontotab. Dette er en databaserecovery-test, ikke en fuld prøve af appen på en ny Cloudflare-konto.

## Gendannelsesøvelse og hændelse

1. Download en krypteret artifact til en beskyttet lokal mappe. Sæt `BACKUP_ENCRYPTION_KEY` sikkert i miljøet.
2. Kør `node scripts/decrypt-backup.mjs INPUT.enc NEW-OUTPUT.sql`. Eksisterende output overskrives aldrig.
3. Kør `node scripts/verify-backup.mjs NEW-OUTPUT.sql NEW-REHEARSAL.sqlite`. Dette importerer intet i produktion.
4. Ved reel recovery: stop trafik og mailafsendelse; gem også den seneste frosne database. Brug `scripts/privacy-restore.mjs BACKUP.sqlite LATEST-FROZEN.sqlite NEW-OUTPUT.sqlite` til at medtage senere lukninger/afmeldinger og tilbagekalde sessioner og nulstillingstokens. Scriptet stopper ved identitetskonflikter eller historik, som kan genidentificere lukkede medlemmer. Hvis den seneste kopi mangler, kræves manuel afklaring af senere ændringer; genindlæs ikke ukritisk en gammel backup.
5. Afprøv den afstemte kopi i et isoleret miljø, kontrollér roller, medlemsdata, kampplaner og samtykker. Godkend først derefter en produktionsimport. Ingen af de nye workflows importerer eller ruller produktion tilbage.

Ved sikkerhedsalarm: vurder rolleændringer og mailaktivitet, tilbagekald berørte sessioner, beskyt kompromitterede konti og roter berørte nøgler. Undgå at slette spor, før hændelsen er undersøgt.
