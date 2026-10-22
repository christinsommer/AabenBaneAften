# Production til lokal Sandbox

Kør fra projektmappen på Windows. Node.js, projektets npm-afhængigheder og Cloudflare-login med adgang til D1-eksport skal være tilgængelige. Scriptet bruger den installerede Wrangler og kalder kun **eksport** mod Production. Det deployer ikke og ændrer ikke Production.

Stop først den lokale udviklingsserver med Ctrl+C. Scriptet afviser overførslen, hvis det finder en kørende udviklingsserver for projektet eller en aktiv deployment-lås.

```powershell
# Vis handlingen uden eksport eller ændringer
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Refresh-Sandbox.ps1 -WhatIf

# Eksporter, rens og verificer i en separat mappe; behold nuværende Sandbox
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Refresh-Sandbox.ps1 -PrepareOnly

# Lav en ny, verificeret kopi og erstat Sandbox
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Refresh-Sandbox.ps1

# Start bagefter
npm.cmd run dev
```

`ExecutionPolicy Bypass` gælder kun denne PowerShell-proces. `-PrepareOnly` aktiverer ikke kopien; næste normale kørsel tager en frisk eksport.

## Hvad kopieres?

- Medlemmer, tilmeldinger, kampe, udskiftninger, feedback uden kommentartekst og registreringsindstillinger.
- Navne bliver til `Testspiller <id>`, medlemsnumre erstattes, mailadresser bliver ugyldige testadresser og telefonnumre fjernes. Spouse-referencer og par, som ikke må spille sammen, følger de nye numre. Historiske kampplaners navne omskrives også. Tvetydige historiske navne stopper kopieringen.
- Globale algoritmevægte, bane- og tidsindstillinger bevares. Beregningsressourcer, særlige vægte pr. arrangement og ekstra kampplansmetadata nulstilles.
- Produktions-PIN-koder, sessioner, 2FA, betroede enheder, nulstillingslinks, nyhedsbrevssamtykker, mailkøer, beregningsjob og øvrige ikke eksplicit tilladte tabeller kopieres ikke. Lukkede profiler forbliver lukkede.

Dette er **pseudonymiserede testdata**, ikke fuldt anonyme data: interne ID'er, fødselsår og spillehistorik bevares. Beskyt derfor stadig den lokale kopi.

## Lokale login og indstillinger

Der oprettes to ekstra testkonti: `90000001` er Super Admin, og `90000002` er almindeligt medlem. De tilfældige firecifrede PIN-koder ligger i `.data/sandbox-refresh/test-logins.json` og genbruges ved næste overførsel. Super Admin skal tilmelde lokal 2FA igen efter hver overførsel.

Scriptet sætter lokalt `RESEND_API_KEY=""`, `NEWSLETTER_ENABLED="false"`, testadministratorens `SUPERADMIN_PLAYER_ID` og `OPTIMIZER_URL="http://127.0.0.1:5117"`. Det opretter en lokal MFA-krypteringsnøgle, hvis den mangler. Øvrige indstillinger bevares. Lokal optimering kræver, at den lokale optimizer-tjeneste kører med den tilsvarende API-nøgle. Mail er bevidst slået fra efter overførslen.

## Backup og fejl

Hver kørsel får sin egen mappe i `.data/sandbox-refresh/`. Rapporten er `verification.json`. Ved aktivering flyttes den gamle, stoppede Sandbox i sin helhed til `local-dev.before`, og eksisterende `.dev.vars` gemmes som `dev.vars.before`. Scriptet forsøger automatisk at gendanne disse ved fejl under udskiftningen.

Rå Production-SQL ligger midlertidigt under Windows' TEMP-mappe og slettes ved normal afslutning og håndterede fejl. Hvis computeren slukkes eller processen dræbes, kan en `aabenbane-export-*`-mappe være tilbage dér. Slet den efter fejlafklaring. Ved strømsvigt midt i udskiftningen kan manuel gendannelse være nødvendig: stop Sandbox, flyt den nuværende `.wrangler/local-dev` til side, gendan den ønskede `local-dev.before` til `.wrangler/local-dev`, og gendan tilhørende `dev.vars.before` som `.dev.vars`. Den oprindelige konfiguration kan genaktivere mail.

Backups, test-PIN-koder og konfigurationskopier er Git-ignorerede, men kan stadig blive synkroniseret af OneDrive. Backups kan indeholde tidligere persondata og hemmeligheder. Opbevar dem beskyttet, og fjern gamle kopier, når de ikke længere er nødvendige. Scriptet sletter ikke gamle backups automatisk.

## Ugentlig kørsel

Der oprettes ingen planlagt opgave automatisk. Opret eventuelt en ugentlig opgave i Windows Opgavestyring under din egen bruger med `powershell.exe` og argumenterne:

```text
-NoProfile -ExecutionPolicy Bypass -File "C:\Users\hytof\OneDrive\Active Supply\Programming\AabenBaneHIK\Refresh-Sandbox.ps1"
```

Laptoppens strøm/netværk og Cloudflare-adgang skal være tilgængelige. Brug indstillingen om at køre en oversprunget opgave senere og undgå samtidige kørsler. En åben udviklingsserver får opgaven til at fejle sikkert; luk serveren og kør igen. Scriptet genstarter ikke serveren automatisk.

Pause ugentlig overførsel ved at oprette filen `.data/sandbox-refresh/paused`; fjern den for at genoptage. Brug gerne `-PrepareOnly` i den planlagte opgave, hvis ugentlige kopier ikke automatisk skal overskrive igangværende testarbejde.
