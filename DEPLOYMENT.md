# Lokal udvikling og udgivelse

Hvert makkerpar må kun optræde én gang i samme kampplan. Kun par med Spouse No.
og “Spille sammen med” (type 2) er undtaget. Reglen gælder også manuel gemning og
låste kampe; den ændrer ikke historikfradrag på tværs af spilledage.

Migration `0012_worried_misty_knight.sql` tilføjer de valgfrie heltalsfelter `spouse_no`
(medlemsnummer) og `spouse_mode` (1 = samtidigt, 2 = samme hold). Kun administratorer
kan se og ændre dem under Medlemmer → Ret medlem, under CR. Det er nok at registrere
relationen på ét medlem. Hvis begge har registreret relationen, gælder det strengeste krav.
Kravet gælder alle kampe, når begge har en gyldig tilmelding med timeønsker; ellers spiller
den tilmeldte normalt. Forskellige timeønsker kan derfor medføre færre tildelte timer.
Niveaugrænser og CR-fradrag mellem de to faste makkere bortfalder ved type 2. Øvrige
spillerkombinationer, holdbalance, historik, mixed-regler og forbudte par er uændrede.
Flere relationer håndhæves samtidigt; modstridende krav kan forhindre kampe.
Ved sletning af et medlem ryddes referencer til dets medlemsnummer.
Både hjemmeside og beregningstjeneste skal udgives. Containerkontrollen kræver
`scoringVersion = unique-partners-v4`, så en ældre beregningstjeneste ikke godkendes.

Migration `0011_lively_trish_tilby.sql` tilføjer `email_visible` og `phone_visible` med TRUE
som standard for eksisterende og nye medlemmer. Medlemmer og administratorer kan ændre
de to valg under profilredigering. Kampplanens kontaktdata filtreres på serveren, og
kontaktikonet skjules, hvis der ikke er nogen synlige kontaktoplysninger. Administratorer
beholder adgang til oplysningerne under Medlemmer. Migrationen skal anvendes før udgivelse
af den nye kode; den normale releaseprocedure håndterer dette.

## PowerShell-script

Kør `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Deploy.ps1` fra projektmappen.
Med `-CheckOnly` køres lokale kontroller uden udgivelse.
Scriptet gemmer terminalens output i `.data/deploy-<tidspunkt>.log`.
OpenNext-advarslen om Windows er ikke i sig selv en fejl. Under release vises det aktive
trin og tidsforbruget hvert 30. sekund. Hvert release-trin har en tidsgrænse på 15 minutter;
ved overskridelse stoppes processens træ på Windows, og de efterfølgende trin afbrydes.
Fejl viser kommando og exitkode eller timeout. Produktionsændringer fra tidligere trin
rulles ikke automatisk tilbage.

Kampfordelingen tillader højst 30 minutters pause mellem en spillers på hinanden følgende
kampe. Kampene varer en time, så starttidspunkterne må højst ligge 90 minutter fra hinanden.
Reglen gælder også ved manuel gemning og for låste kampe i den færdige plan.

## CR til gennemgang

Migration `0010_cr_review.sql` tilføjer `players.cr_reviewed_at` og markerer de eksisterende medlemmer som gennemgået uden at ændre deres CR. Nye profiler får som standard ingen godkendelsesdato og vises øverst under Medlemmer med “CR skal gennemgås”. Kun administratorer kan gemme og godkende CR. Det kan gøres på ethvert tidspunkt, uanset tilmeldingens og kampplanens status. Godkendelsen påvirker ikke adgangen til tilmelding.

Ændres CR via den almindelige medlemsredigering, kræver den nye værdi en ny godkendelse. Ændringer af navn, kontaktoplysninger og selvvalgt niveau nulstiller ikke i sig selv godkendelsen. Gennemgang fungerer også uden kommende spilledage. Kør migrationen før den nye Worker udgives; den eksisterende releaseprocedure gør dette automatisk. `/api/health` kontrollerer nu også, at den nye kolonne findes.

Appen bruger Cloudflare D1 både lokalt og i produktion. Lokal D1 er simuleret på computeren og ligger i `.wrangler/local-dev/v3`. Den har ingen forbindelse til produktionsdata.

## Arbejd lokalt

```sh
npm run dev
```

Åbn http://localhost:3000. Første start tager backup af `.data/app.db` i `.data/backups` og kopierer data til den nye lokale D1. Senere starter genbruger D1 og anvender nye migrationer. Den gamle SQLite-fil bliver bevaret, men appen skriver ikke længere til den. Der kopieres aldrig lokale data til produktion under udgivelse.

E-mail kræver `RESEND_API_KEY` i det relevante miljø. Lokalt kan den sættes i `.dev.vars`; uden nøgle returnerer e-mailfunktionen en fejl og sender intet. Produktionsnøglen forbliver en Cloudflare-secret og må ikke lægges i kildekoden.

## Ændringer i databasestrukturen

Ret `db/schema.ts` og kør:

```sh
npm run db:generate
npm run db:setup
```

Gennemgå den genererede SQL i `drizzle` før udgivelse. Brug additive migrationer; sletning af kolonner/data kræver en særskilt plan. Eksisterende migrationer må ikke omskrives, når de er anvendt. Gem SQL og Drizzle-metadata sammen med kodeændringerne.

## Kontroller uden at udgive

Stop udviklingsserveren med Ctrl+C først, så build og server ikke skriver samtidigt til `.next`.

```sh
npm run release:check
```

Dette bygger den rigtige Worker og kører tests mod en isoleret lokal D1, inklusive login, rettigheder, profiler, tilmeldinger og sundhedskontrol. Ingen fjernmigration, backup eller deployment køres. Start derefter `npm run dev` igen, hvis du vil fortsætte lokalt.

## Udgiv til aabenbaneaften.dk

Når du ønsker at offentliggøre ændringerne:

```sh
npm run cf:login
npm run release
```

Login kræves kun, hvis Cloudflare-sessionen er udløbet. Release bygger og tester igen, eksporterer produktionsdatabasen til `.data/releases/<tidspunkt>/database.sql`, anvender manglende D1-migrationer og udgiver Worker. Til sidst kontrolleres `/api/health`, inklusive det unikke versionsnummer og adgang til de nye databasefelter. En kvittering gemmes ved succes.

Fejl stopper de efterfølgende trin. Hvis migrationen lykkes, men deployment fejler, er databasen allerede opdateret. Der foretages ingen automatisk tilbagerulning af data. Undersøg fejlen og backup, før du genkører kommandoen. Backup indeholder persondata og skal opbevares privat. En bestået lokal kontrol beviser ikke, at Cloudflare-login og produktionsrettigheder stadig er gyldige.

`release.lock` forhindrer to samtidige releases. Hvis processen bliver tvangsafbrudt, fjern kun låsen i `.data/releases`, efter du har kontrolleret, at ingen release stadig kører.

De lave `cf:deploy`-kommandoer springer kontrollerne over; brug normalt `npm run release`.

## Tilmeldingsrækkefølge

`signups.signup_order` er et kønummer pr. spilledag. Databasetriggere tildeler nummeret, også når en ældre Worker opretter tilmeldingen uden at kende feltet. `created_at` bevares som oprindeligt oprettelsestidspunkt. Migration 0005 giver eksisterende rækker numre efter `created_at` og derefter `id`, hvis tidspunktet er ens. Den tidligere historik kan ikke fortælle den præcise rækkefølge inden for samme sekund ud over disse ID'er.

Ændringer i timer eller mulige tider bevarer kønummeret. Afmelding eller 0 timer ophæver pladsen; gentil­melding med positive timer giver et nyt nummer bagest. Venteliste/aktiv-status alene flytter ikke en tilmelding. Kønumre kan have huller og er derfor ikke nødvendigvis lig den aktuelle placering blandt aktive tilmeldinger.

Feltet registrerer prioriteten; automatisk fordeling af første, anden og tredje time implementeres særskilt. Administrator kan se feltet i den lokale spillerliste. Visning på hjemmesiden kræver senere udgivelse af Worker, men selve registreringen virker straks efter databaseændringen.

Migrationerne indeholder komplette SQL-statementer adskilt med `--> statement-breakpoint`; de må ikke opdeles på semikolon, da triggere indeholder flere semikoloner. Bevar triggerne ved fremtidige ændringer af tilmeldingstabellen.
