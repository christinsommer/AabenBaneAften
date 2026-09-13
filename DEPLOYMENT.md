# Lokal udvikling og udgivelse

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
