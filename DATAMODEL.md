# Medlemmer og tilmelding

Medlemmer ligger i D1-tabellen `players`.

| Felt i appen | Databasefelt | Type og regel |
| --- | --- | --- |
| Fornavn | `first_name` | Tekst; påkrævet ved oprettelse og profilændring |
| Efternavn | `last_name` | Tekst; påkrævet ved oprettelse og profilændring |
| Medlemsnummer | `member_no` | Unik tekst; bevarer eventuelle foranstillede nuller |
| E-mailadresse | `email` | Valideret tekst ved oprettelse og profilændring |
| Køn | `gender` | Påkrævet tekst: M (mand) eller K (kvinde); kan ændres på profilen |
| Egen ranking | `self_level` | Fri tekst, 1–100 tegn; forslag: A, A-, AB, B+, B, B-, BC, C+, C eller C- |
| Christin Ranking (CR) | `christin_ranking` | Udfyldes automatisk ved oprettelse; heltal 1–9 eller NULL; kun administratorer kan se og ændre |

`id` er den interne nøgle, som tilmeldinger, kampe og sessioner refererer til.
`name` bevares af hensyn til eksisterende visninger og opdateres sammen med
fornavn og efternavn. Migrationen deler eksisterende navne ved første mellemrum;
medlemmet kan rette opdelingen på profilen. Et manglende efternavn bliver ikke
opfundet. Medlemsnummeret vises skrivebeskyttet på profilen, så invitationernes
medlemsnumre forbliver gyldige. Køn, telefon, rolle og PIN-hash bevares.

Den eksisterende kampfordeling bruger `self_level` og den tidligere
administratorvurdering `admin_level`. CR gemmes særskilt; den ændrer ikke
kampalgoritmen uden en aftalt fortolkning af skalaen.
De nye rankingbetegnelser understøttes i den eksisterende niveaubaserede
kampfordeling og afløserfunktion: A- behandles som A, B+ som AB, B- som B,
og BC/C+/C- som C. Den præcise CR-værdi gemmes separat efter tabellen nedenfor.

Ved oprettelse beregner serveren CR fra Egen Ranking:

| Egen Ranking | CR |
| --- | ---: |
| A | 2 |
| A- | 3 |
| AB | 4 |
| B | 5 |
| B+ | 4 |
| B- | 6 |
| BC | 7 |
| C+ | 7 |
| C | 8 |
| C- | 9 |

Klienten kan ikke vælge sin egen CR. Senere profilændringer overskriver ikke CR.
Eksisterende medlemmers vurderinger, inklusive NULL, bevares.

Matchning ignorerer store/små bogstaver og mellemrum i starten/slutningen.
Hvis teksten ikke matcher tabellen præcist, bruges første gældende regel:
indeholder A → CR 4; ellers B → CR 6; ellers C → CR 8.
Uden disse bogstaver sættes CR til NULL, indtil administratoren vurderer medlemmet.
Den indtastede rankingtekst bevares. Ukendt niveau uden A/B/C kræver vurdering,
før medlemmet kan indgå i automatisk kampfordeling eller foreslås som afløser.

Under Administration → Medlemmer → Ret medlem kan administratoren rette
fornavn, efternavn, e-mail, mobilnummer, køn, egen ranking og CR. Serveren bruger
altid medlemmets eksisterende medlemsnummer og accepterer ikke ændringer af det.
Administratorroller håndteres fortsat under Indstillinger. Profilredigering
ændrer ikke roller eller personlige koder.

Under Medlemmer kan administratoren slette et medlem efter bekræftelse af
navn og medlemsnummer. Egen konto kan ikke slettes. Medlemsrækken, sessioner,
tilmeldinger, relaterede invitationer og feedback slettes samlet i en D1-batch.
Afløsersøgninger oprettet af medlemmet fjernes; hvis medlemmet var afløser,
genåbnes den berørte søgning som uafklaret. Andre medlemmers kampe bevares,
og det slettede interne spiller-id vises som “Slettet medlem” i kampplanen.
Administrator skal rette eventuelle berørte kampplaner. Sletningen kan ikke fortrydes.

CR og `admin_level` sendes ikke i medlemsprofilens API-svar til almindelige
medlemmer. CR findes kun i administratorens medlemsoversigt.

## Input til tilmelding

`POST /api/app` med `action: "signup"` accepterer:

```json
{"action":"signup","nHours":2,"nPossible":3,"szPossible":["18:30","19:30","20:30"]}
```

| Felt | Type | Regel |
| --- | --- | --- |
| `nHours` | integer | 0, 1, 2 eller 3 ønskede timer |
| `nPossible` | integer | Antallet af elementer i `szPossible` |
| `szPossible` | string[] | Forskellige gyldige starttider på formatet HH:mm |

Listen svarer til position 1 til nPossible i beskrivelsen; JSON/JavaScript
indekserer den fra 0. Antallet af mulige tider skal mindst være de ønskede timer.
0 timer betyder, at medlemmet ikke ønsker at spille; tider kan være en tom liste,
og medlemmet udelades fra automatisk kampfordeling.

Data gemmes i de eksisterende `signups.requested_hours` og `signups.availability`
(JSON-array). API-svar giver også `nHours`, `nPossible` og `szPossible`.
`nPossible` beregnes fra listen, så to lagrede værdier ikke kan komme ud af takt.
Medlemmer uden tilmelding får `nHours = 0`, `nPossible = 0` og `szPossible = []`
i API'et og administratorens aktuelle spillerliste, med status `not_registered`.
Samme nulværdier gælder ved afbud. Der oprettes ikke kunstige tilmeldingsrækker;
standardværdierne dannes pr. spilledag ved at sammenholde alle medlemmer med
dagens tilmeldinger. Det gælder også nye medlemmer og kommende spilledage.
Eksisterende tilmeldinger kræver ingen omskrivning. Det tidligere inputformat
accepteres for allerede åbne klienter. Den eksisterende kampfordeling fordeler
fortsat højst én kamp pr. spiller; datamodellen gemmer ønsket om op til tre timer.

Appens manifest og telefonikoner giver installation på hjemmeskærmen med
`display: standalone`. Installation vises nederst på siden. Tilmelding kræver
internet; der gemmes ikke offline-kopier af medlemsdata.

## Manuel tilmelding og test

`events.registration_override` er `auto`, `open` eller `closed`.
`auto` følger `registration_opens_at` og `registration_closes_at`.
`open` åbner uden for tidsplanen, og `closed` lukker også inden for tidsplanen.
En aflyst runde er altid lukket. Reglen håndhæves på serveren for alle medlemmer,
inklusive administratorer; kun administratorer kan ændre tilstanden.

`is_test` markerer testdata, og `test_active` vælger en fælles testrunde på forsiden.
Migration 0002 markerer den eksisterende runde 2026-09-11 som aktiv testrunde og
åbner den manuelt. Eksisterende kampe og tilmeldinger bevares i denne runde.
Når administratoren vælger **Afslut testfase**, lukkes den, `test_active` bliver
falsk, og forsiden går tilbage til næste almindelige runde. `is_test` bevares,
så runden fortsat kan identificeres som testdata.

## Spilledage

Spilledage vælges fra `events`; appen opretter ikke længere datoer automatisk.
Migration 0003 tilføjer alle 34 fredage fra 11. september 2026 til og med
30. april 2027, inklusive første fredag i måneden og helligdage.
Eksisterende datoer og deres tilmeldinger bevares.

Administratorer kan tilføje vilkårlige datoer under Spilledage. Standardfrister
er kl. 12 dansk tid to dage før og dagen før spilledagen, også over sommertid.
Fjernelse sætter `archived = true`, så datoen forsvinder fra listen uden at slette
tilmeldinger og kampe. Tilføjes datoen igen, genbruges dens oprindelige id og data.
En aktiv testrunde skal afsluttes, før den kan fjernes.

Forsiden viser den aktive testrunde eller den næste ikke-arkiverede, ikke-aflyste
dato fra og med dags dato i Danmark. Når listen er udløbet, vises en tom kalender,
og administratoren kan tilføje flere spilledage. Profilen er stadig tilgængelig.
