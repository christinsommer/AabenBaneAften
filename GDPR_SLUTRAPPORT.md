# Privatliv og nyhedsmails i AabenBaneHIK

Dato: 11. oktober 2026, dansk tid. Ændringerne er udviklet og afprøvet lokalt.
Ingen offentliggørelse, produktionsmigration, rigtige nyhedsbreve eller
profilsletninger er udført. Dette er ikke en juridisk GDPR-godkendelse.

## Kortlægning og tilpasning

AGENTS.md og Next 16.3.3s lokale route-/konfigurationsvejledninger er læst.
Projektet bruger Next.js/OpenNext, Drizzle og Cloudflare D1. Medlemmer ligger i
`players`, login bruger medlemsnummer og beskyttet PIN samt hashbaserede
30-dages sessioner. Eksisterende roller er `player` og `admin`. Alle nye
administrationshandlinger kræver `admin` på serveren. Ejerens senere ønske om
Admin/SuperAdmin-opdeling er ikke indført i denne opgave.

Kontakt er projektets `aabenbaneaften@hik.dk`; ejeren har angivet administrator
Christin Hytoft Sommer som ansvarlig kontakt. Juridisk dataansvarlig, adresse
og relationen til HIK kræver endelig afklaring. Der er ikke kopieret
SommersSaunagus-adresser, databaseplaceringer eller tekniske driftsantagelser.

Tilmeldinger, venteliste, kampønsker, makkerrelationer, kampfordeling,
udskiftninger, feedback og importerede kampplaner er kortlagt. Der er ingen
betalings-, ordre-, saldo- eller kliptabeller i den gennemgåede datamodel.
Derfor er ingen fiktive økonomimoduler tilføjet. Eventuelle forhold uden for
appen skal indgå i ejerens konkrete slettevurdering.

Resend bruges allerede til velkomst, PIN og kampplaner. Disse servicemails
er bevaret og afhænger ikke af nyhedsbrevssamtykke. Den gamle testmail sender
en fast driftsbesked til administratoren selv; den giver ikke fri udsendelse
til medlemslisten. Ingen eksisterende generel nyhedsbrevstilmelding er fundet.
Der er ikke tilføjet AI-tjenester, tracking eller billed-upload. Eksisterende
statiske billedressourcer og deres behandling er bevaret.

## Implementerede funktioner

- Danske sider `/privacy` og `/cookies`, links i sidefod, oprettelsesinformation,
  særskilt læsekvittering og frivilligt, ikke forhåndsvalgt nyhedsbrevssamtykke.
- Informationsdialog for eksisterende medlemmer uden kvittering for den aktuelle
  version. Begge sider kan læses uden at lukke dialogen. Versionskontrol af
  indsendte formularer forhindrer kvittering for en tekst, der er blevet ændret.
- Profil, kvitteringer og eventuelt samtykke oprettes i én D1-batch. Velkomstmail
  er en efterfølgende servicemeddelelse, hvis fejl ikke sletter den oprettede profil.
- Aktivitetsregistrering ved login, tilmelding/venteliste, nyhedsbrevsvalg og
  faktisk indlogget besøg/betjening. Browseraktivitet begrænses til højst én
  opdatering pr. fem minutter pr. monteret visning. Ingen timer holder profilen
  kunstigt aktiv. Nye profiler bruger oprettelsestidspunktet.
- Eksisterende ukendt aktivitet får 25. september 2026 med `activity_known=0` og
  særskilt visning. Det er en udtrykkeligt valgt standarddato, ikke en opdigtet
  historisk aktivitet. Dokumenteret aktivitet ændrer flaget til kendt.
- Adminopgaver ved 24 måneders inaktivitet, ukendt aktivitet, kontaktlog,
  redigerbare mailto/SMS/tel-forslag, begrundet Behold og fremtidig revurdering.
  Behold ændrer ikke medlemsaktivitet. Åbning af kontaktlink registrerer intet.
- Kontrolleret profilafidentifikation med relationer, spærringer og eksplicit
  bekræftelse. Den gamle direkte slette-API returnerer en afvisning og brugerfladen
  henviser til privatlivsprocessen. Database-trigger forhindrer direkte profilsletning.
- Præcist samtykkebevis, adresse på samtykketidspunktet, version, checkboxtekst,
  hjælpetekst, kilde og handling. Status: tilmeldt, pauset, afmeldt og aldrig
  tilmeldt. Udokumenterede flag giver ingen modtagertilladelse.
- Straksafmelding, pause i 30 døgn, genoptagelse og sikkert pauseudløb. Ændring af
  e-mail invaliderer samtykke til den gamle adresse og tilbagekalder gamle tokens
  på databaseniveau, også ved administratorredigering.
- Stærke 256-bit personlige tokens gemmes kun som SHA-256-hash og bindes til profil,
  adresseversion og samtykkereference. Links bruger den eksisterende HTTPS-adresse.
  Token ligger i URL-fragmentet, fjernes fra adresselinjen og sendes kun i POST
  efter aktiv bekræftelse. GET/mailscannere ændrer ikke præferencer.
- Nyhedsbrevskladder, lokal forslagsskabelon, forhåndsvisning, modtagerstatusfilter,
  uafhængige udsendelseskopier, arkiv og Kopiér som ny.
- Individuel afsendelse via eksisterende Resend med idempotensnøgle, kontrol af
  modtager både ved klargøring og afsendelse samt særskilt 30-dages frekvensbekræftelse.
  Ingen andre modtageradresser i mailen. Sendt betyder udbyderaccept, ikke levering.
  Fejl/usikkerhed registreres og genafsendes ikke automatisk.
- Serverkontrol af rolle, profil og aktuelle tilstande; skrive-API kræver JSON og
  afviser cross-origin browserkald. Ingen private API-svar caches.

## Datamodel

Migration `0016_privacy_newsletter.sql` er additiv, versionsstyret med den
eksisterende Drizzle/D1-migrationsmekanisme og med indholdsmanifest.
Den ændrer ikke eksisterende medlemsfelter eller historikrækker ved installation.

| Tabel | Indhold |
| --- | --- |
| privacy_documents | Dokumenttype, version, fuldt indhold, SHA-256-hash, registreret publiceringstid. Også den præcise samtykketekst versionskontrolleres her. |
| privacy_acknowledgements | Medlem, dokumenttype/version, tidspunkt og kilde; unik kvittering pr. version. |
| profile_privacy | Seneste aktivitet, kendt/ukendt, aktivitetstype, lukning, vurderingsstatus, kontakt og revurdering. |
| privacy_review_events | Handling, kontaktmetode, kort note, tidspunkt og administrator. |
| newsletter_preferences | Aktuel status, pauseudløb, adresseversion, samtykkereference og ændringstid. |
| newsletter_events | Samtykker og præferenceændringer med adresse, tekst, version, kilde og tidspunkt. |
| newsletter_tokens | Tokenhash, profil, adresseversion, samtykkereference, oprettelse og tilbagekaldelse. |
| newsletter_drafts | Redigerbare kladder med oprettelse, ændring og administrator. |
| newsletter_dispatches | Selvstændig indholdskopi, administrator, klargøring og frekvensundtagelse. |
| newsletter_recipients | Individuel modtager, samtykkereference, klargjort/sending/sent/failed/uncertain/excluded, tidsstempler og udbyder-ID. |

Privatlivstabellerne anvender custom SQL; næste ændring skal være en ny migration.
Gamle dokumentversioner bevares. Samme versionsnummer med andet indhold afvises.

## Begrænsninger ved sletning

Administratorkonti, kommende tilmeldinger og igangværende mailafsendelse spærrer
lukning. Tidligere tilmeldinger, kampe, kampønsker, udskiftninger og feedbackrelationer
bevares og spærrer ikke længere. Matchende fulde navne i importerede kampplaner
erstattes med NN og profil-ID; ulæselige planer og navnesammenfald kræver
manuel afklaring. Forkortelser og fri tekst kræver særskilt gennemgang.
Navn/e-mail i nyhedsbrevstekst giver også en spærring. Der er ikke
opfundet en universel bevaringsfrist eller en påstand om permanent opbevaring.

Når ingen spærringer foreligger, bliver fornavnet NN og efternavnet profilens ID.
Visningsnavnet bliver fx NN 87. Medlemsnummeret erstattes med closed-87 og frigives
til en ny profil. Gamle invitationers medlemsnummerreference ændres samtidig,
så de ikke overtages af en senere profil. Kontaktdata, PIN,
aldersoplysninger og makkerrelationer fjernes; CR og den eksisterende
CR-godkendelsesdato bevares som del af spillehistorikken. Lukkede profiler er
udelukket fra Admins medlemsliste og CR-gennemgang, og CR-skrivekald afvises.
Sessioner og resetkoder fjernes,
nyhedsbrevstokens tilbagekaldes, adresser i samtykke-/modtagerdata og kontaktnoter
ryddes. Feedbackkommentarer skrevet af eller om profilen ryddes. Køn/niveau erstattes med tekniske standardværdier krævet af eksisterende
NOT NULL-felter. Profilen mærkes lukket og kan ikke genaktiveres ved almindelig
redigering. Teknisk ID, oprettelsestid og revisionsrelationer består. Resultatet
er pseudonymiseret og kan fortsat forbindes med personen via historiske relationer.
Privatlivsinformationen har derfor fået version 2026-10-12-v1; tidligere versioner bevares.
Gendannelsesscriptet stopper fortsat ved historik for lukkede profiler, så en
manuel gennemgang skal genanvende navneerstatninger før genåbning.

Eksterne mailarkiver, eksportfiler, gamle backups og eventuelle allerede delte
kampplaner kræver en dokumenteret særskilt procedure. Gamle, allerede Git-sporede
filer fjernes ikke fra historikken af denne implementering.

## Faktisk drift og afklaringer

Verificeret i koden: Cloudflare Workers/D1, Resend, det eksisterende offentlige
domæne og lokalt adskilt D1. Ikke verificeret på driftskonti: fysisk placering,
databehandleraftaler, internationale overførsler, backupretention, leveringswebhooks
og hvem der har faktisk leverandøradgang. Kontrollér også, at Resends eventuelle
åbnings-/kliksporing er deaktiveret; appen tilføjer ikke sådan tracking. `NEWSLETTER_ENABLED` skal sættes eksplicit
før afsendelse; det er ikke sat i produktion under arbejdet.

Kun den nødvendige sessioncookie findes i aktive appflows. Generiske, ubrugte
UI-bibliotekskomponenter indeholder sidebar-/temalagring, men deres providers
anvendes ikke af appen. Cookie-/teknologibrug på den faktisk publicerede installation
skal kontrolleres før udgivelse. Ingen acceptbanner er tilføjet uden konkret behov.

Ejeren skal afklare juridisk identitet/adresse, behandlingsgrundlag og interesseafvejning,
offentlig adgang til navne i kampplaner, konkrete frister for hver datatype,
eksterne økonomiske relationer, backupansvar/rotation/adgang samt leverandøraftaler
og geografiske forhold. Supplér teksterne med **ny version**, når oplysningerne er afklaret.

## Kontroller og dokumentation

Se den endelige teststatus nederst. Alle nye muterende testhandlinger anvender
syntetiske profiler. Resend simuleres eller mangler nøgle under test.
Backup/gendannelse er kontrolleret på isolerede syntetiske databaser; ingen
produktionsbackup eller produktionsgendannelse er udført som bevis for driften.

- [Administratorvejledning](./GDPR_ADMIN.md)
- [Backup og gendannelse](./GDPR_BACKUP.md)
- Tests: `tests/privacy.test.mjs`, `tests/privacy-backup.test.mjs`, `tests/privacy-export.test.mjs`
- Browserkontrol: `node scripts/check-privacy-browser.mjs` efter Cloudflare-build.

## Officielle kilder kontrolleret 11. oktober 2026

- [Datatilsynet: GDPR for små foreninger](https://www.datatilsynet.dk/regler-og-vejledning/gdpr-univers-for-smaa-foreninger)
- [Datatilsynet: Husk at slette](https://www.datatilsynet.dk/regler-og-vejledning/gdpr-univers-for-smaa-foreninger/trin-3-husk-at-slette)
- [Forbrugerombudsmanden: Uanmodede elektroniske henvendelser](https://forbrugerombudsmanden.dk/alle-emner/uanmodede-henvendelser/uanmodede-elektroniske-henvendelser-spam)
- [Digitaliseringsstyrelsen: Cookievejledningen](https://digst.dk/tilsyn/sporingsteknologiomraadet/cookievejledningen)
- [GDPR, især artikel 5, 6 og 13](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679)
- [Cloudflare: D1 import/eksport](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
- [Resend: Idempotens](https://resend.com/changelog/idempotency-keys)

Kilderne understøtter nødvendighed, begrænsning, information og frivilligt
tilbagekaldeligt markedsføringssamtykke. De gør ikke den valgte 24-måneders
arbejdsgang eller én måned mellem nyhedsbreve til lovkrav.

## Endelig teststatus

12. oktober: anonymisering er testet med bevaret CR og CR-godkendelsesdato.
Den lukkede profil er fraværende i Admins medlems-/CR-liste, og et direkte
API-forsøg på at ændre dens CR afvises uden at ændre den bevarede værdi.

12. oktober: gentagen oprettelse/lukning med samme medlemsnummer er testet
over tre nye profiler, med unikke ID’er, loginophør og uden overførsel af
historik, invitationer eller samtykke. Alle tre målrettede tests består.
Ældre, allerede lukkede profiler er ikke automatisk omskrevet.
Den seneste buildkørsel blev stoppet af Windows-filrettigheder/låsning i `.next`.


Efter ændringen til NN + medlemsnummer er Next.js-build, TypeScript og lint for
de ændrede komponenter/services bestået. Tre målrettede tests er bestået, inklusive
lukning med bevaret historik, navneerstatning i kampplan, loginophør, spærring ved
kommende tilmelding og fuld rollback ved simuleret fejl midt i lukningen samt
backup/gendannelse. Cloudflare-pakningen kunne ikke gentages ved denne ændring,
fordi Windows låste den lokale `.open-next`-mappe. Nedenstående samlede regression
og browserkontrol gælder den foregående levering.

- Samlet regression: **113 tests bestået, 0 fejl**, med isolerede data.
- Optimizerens .NET-build og funktionstest bestået uden buildadvarsler.
- Next.js/TypeScript- og OpenNext/Cloudflare-build bestået.
- Browserkontrol bestået ved 390 px og 1440 px: informationsdialog, profil,
  administration, nyhedsbrevsforslag, kladde, forhåndsvisning og eksplicit tokenhandling.
- Nye privatlivsfiler består lint. Fuld lint er ikke grøn: de samme 67 eksisterende
  kildekodefejl findes i projektets oprindelige eksportscript, API og hovedkomponent.
- Konsistent D1-eksport, verificeret gendannelse, migrationsgentagelse og lokal
  opgradering er afprøvet på syntetiske databaser. Ingen rigtig medlemsdatabase
  er migreret eller ændret under implementeringen.

Implementeringen leveres som kildekode. Udgivelse, produktionsmigration og aktivering
af nyhedsbrevsafsendelse er ikke udført. Driftsafklaringerne ovenfor skal behandles
før ibrugtagning; kodeændringerne udgør ikke en juridisk GDPR-godkendelse.
