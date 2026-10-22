# Backup, migration og gendannelse

## Kendt miljø og adgang

Projektet er konfigureret til Cloudflare Worker `aabenbaneaften`, domænet
`aabenbaneaften.dk` og D1-bindingen `DB`. Lokal D1 er adskilt og ligger under
`.wrangler/local-dev/v3`. Ældre `.data/app.db` er en tidligere SQLite-kilde.
Den lokale arbejdsmappe ligger under en OneDrive-mappe; faktisk synkronisering,
adgangsrettigheder, kryptering, retention og cloudkopier er ikke verificeret.

Faktisk D1-region/jurisdiktion, Cloudflare-plan, Time Travel-periode, Resend-region,
databehandleraftaler og overførselsgrundlag skal bekræftes af ejeren. En dansk
webadresse dokumenterer ikke dansk opbevaring.

## Backup og migrationsprøve

Luk lokal udviklingsserver før ændringer. Brug fra projektmappen:

```sh
node scripts/backup-privacy.mjs --local
```

Til en særskilt, autoriseret produktionsbackup:

```sh
node scripts/backup-privacy.mjs --remote
```

Lokalt bruger scriptet samme eksportfunktion i D1-motoren som den installerede
Wrangler, fordi dens CLI ikke understøtter valg af den særlige persistenssti.
Fjernbackup bruger Wranglers officielle `d1 export --remote`.
Scriptet laver en D1 SQL-eksport i `.data/privacy-backups/<UTC-tid>/`, gendanner
til `restored-rehearsal.sqlite`, kontrollerer integritet og fremmednøgler,
afprøver manglende migrationer og gentager dem. Optællinger og hashes af alle
oprindelige tabeller sammenlignes; personoplysninger og hemmeligheder udskrives
ikke. Eksportlog og databasefiler er private. Hashene dokumenterer konsistens,
ikke at en administrator med skriveadgang ikke kan ændre både data og manifest.

`drizzle/checksums.json` fastlægger de forventede migrationsfiler. Versionerede
SQL-filer må ikke ændres efter anvendelse. Migration 0016 er en Drizzle custom
migration med journal/snapshot; privatlivstabellerne vedligeholdes med custom
SQL, ikke med `drizzle-kit push`. D1 anvender versionslisten `d1_migrations`.
Muterende funktioner bruger atomiske D1-batches med kontroller inde i batchen.

Den almindelige releaseprocedure bygger og tester, eksporterer en backup,
verificerer gendannelse og afprøver migrationen, før den ændrer produktion.
Efter migration foretages ny eksport og sammenligning inden Worker-udgivelse.
Hold medlemsændringer i ro i dette interval; ellers kan en legitim samtidig
ændring få sammenligningen til at afbryde udgivelsen. Der foretages ingen
automatisk tilbagerulning. Lokal D1-opgradering kræver tilsvarende verificeret
backup, når der findes data og manglende migrationer.

Backups er ignoreret af Git. Fastlæg ejer, ACL, kryptering, rotation, slettefrist
og en ekstern beskyttet kopi før drift; implementeringen gætter ikke på disse
organisatoriske beslutninger og sletter ikke eksisterende backups automatisk.
Historiske, allerede versionsstyrede eksportfiler eller kopier i Git-historik
fjernes ikke af en ny `.gitignore` og kræver særskilt gennemgang.

## Gendannelse må ikke ophæve nyere valg

En gammel backup må aldrig importeres direkte og genåbnes som normal drift.

1. Luk al brugertrafik og afsendelse, også eksisterende servicemails, under
   driftsarbejdet. Sæt `NEWSLETTER_ENABLED=false`. Stop baggrundsarbejde.
2. Tag en **ny, konsistent fuld eksport af den seneste database efter frysning**.
   Sikr desuden kontaktanmodninger og ændringer modtaget uden for appen.
3. Gendan både den gamle backup og den nyeste eksport isoleret, og bring begge
   kopier til det aktuelle skema med den verificerede migrationsprøve.
4. Fremstil en ny offline-kopi:

```sh
node scripts/privacy-restore.mjs GAMMEL.sqlite SENESTE-FROSNE.sqlite NY-KOPI.sqlite
```

5. Scriptet genanvender den seneste privatlivstilstand, kontolukninger, valg,
   pauser og revisionsdata. Gamle adresser med mismatch kræver nyt samtykke.
   Alle sessioner, resetkoder og nyhedsbrevslinks tilbagekaldes. Gamle ventende
   udsendelser udelukkes fra afsendelse. Output skal være en ny fil.
6. Manglende/ændrede profilidentiteter eller gamle relationer til en senere
   lukket profil stopper processen til manuel vurdering. Der importeres aldrig
   automatisk til produktion. Kopien kan være oprettet selv ved fejl og må da
   ikke bruges. Den seneste kopi indeholder kun bevis for registrerede ændringer;
   uden denne eller et komplet eksternt revisionsgrundlag kan sikker gendannelse
   ikke dokumenteres, og normal drift skal forblive lukket.
7. Kontrollér konkrete sletningssager, match-/mailarkiver, noter, eksportfiler,
   eventuelle økonomiske forhold uden for appen, nye medlemmer efter backup og
   leverandørkopier. Afklar reintroducerede profilændringer fra backupen.
8. Importér kun efter godkendt operativ kontrol. Kontrollér optællinger, login,
   roller, historik, samtykke og fravær af genopståede oplysninger. Aktivér
   trafik og mail særskilt efter kontrollen.

Den automatiske offline-genanvendelse er testet med syntetisk kontolukning og
pause. Den er ikke en gennemført produktionsgendannelse eller en fuldstændig
organisatorisk backupordning.
