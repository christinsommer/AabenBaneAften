# Kampoptimering med Google OR-Tools CP-SAT

Next.js/Cloudflare kalder denne .NET 10-tjeneste over HTTP. Google.OrTools 9.15.6755 bruger den native CP-SAT-motor. Ingen JavaScript-heuristik anvendes som erstatning.

## Lokal opsætning

1. Installér .NET 10 SDK (allerede tilgængelig på denne udviklingsmaskine).
2. Kør `npm run optimizer:test` fra projektets rod. Det gendanner låste NuGet-pakker, bygger tjenesten og tester den rigtige solver.
3. Kør `npm run db:setup` for at tilføje det valgfrie fødselsår til lokal D1.
4. Kør `npm run optimizer:start`. Første gang opretter kommandoen en tilfældig lokal API-nøgle og tilføjer den samt `OPTIMIZER_URL=http://127.0.0.1:5117` i `.dev.vars`. Eksisterende værdier bevares. Nøglen udskrives ikke.
5. Lad beregningstjenesten køre, og kør `npm run dev` i en anden terminal. Genstart appen, når `.dev.vars` ændres. Ved manuel opsætning skal app og tjeneste have samme `OPTIMIZER_API_KEY` på mindst 32 tegn.
6. Log ind som administrator, luk tilmeldingen, og vælg **Kampplan Admin → Algoritme foreslå kampe**.

**Algoritme foreslå kampe** beregner og kontrollerer et forslag og gemmer det automatisk som kladde. Tabellen og **Baner, der ikke bruges** opdateres under **Admin → Kampplan Admin**, som ved Excel-import. Offentliggørelse sker særskilt. Også gyldige løsninger uden bevist optimalitet gemmes; status fremgår tydeligt. Tomme eller ugyldige forslag erstatter ikke kladden. Vægte gælder det konkrete forslag. Fødselsår kan rettes under **Min profil** eller **Admin → Medlemmer → Ret medlem**. Listen går fra indeværende år minus 16 ned til 1940. Alder beregnes som indeværende år i Danmark minus fødselsår. Tomt fødselsår er tilladt, når FactorAge er 0; en anden aldersvægt kræver fødselsår på alle deltagere. Den gamle alderskolonne bruges ikke længere. Kun fiktive SB50-sandboxprofiler konverteres automatisk; øvrige medlemmer skal angive deres fødselsår.

## Produktion

Produktionen bruger Worker `aabenbane-optimizer` og en Cloudflare Container. Konfigurationen er i `optimizer-cloudflare/wrangler.jsonc`. Én `standard-2`-instans genbruges og går i dvale efter to minutters inaktivitet. Alle HTTP-kald, inklusive `/health`, kræver den hemmelige nøgle, før containeren startes. Containeren har ikke internetadgang.

Med Docker Desktop startet køres fra projektets rod:

```sh
npm run optimizer:deploy
npm run optimizer:check
npm run optimizer:connect
npm run release
```

Første deployment kan kræve nogle minutters provisionering, før `optimizer:check` lykkes. Kontrollen beregner en lille kampplan med fiktive spillere og efterprøver de to CR-faktorer uden at læse eller ændre D1. `optimizer:connect` gentager kontrollen og sætter derefter `OPTIMIZER_URL` og `OPTIMIZER_API_KEY` som secrets på hjemmesidens Worker. En produktionsnøgle oprettes i den git-ignorerede `.data/optimizer-production/key` og genbruges ved senere udgivelser. Den må ikke publiceres eller slettes under almindelig oprydning. Ved nøgleskift skal begge Workers opdateres.

Appen venter op til 160 sekunder på containeren; browseren op til 180 sekunder. Selve optimeringen har fortsat sin eksisterende tidsramme. Den ekstra ventetid giver plads til opstart efter dvale.

Tjenesten kræver en separat vært med .NET/native biblioteker, fx en container-vært. Den indgår ikke automatisk i Worker-deploymentet.

```sh
docker build -t hik-optimizer optimizer-service
docker run --rm -p 8080:8080 -e OPTIMIZER_API_KEY hik-optimizer
```

Brug HTTPS foran tjenesten. Sæt `OPTIMIZER_URL` og `OPTIMIZER_API_KEY` i Cloudflare Workers-miljøet og samme nøgle hos tjenesten. API-nøglen skal være en secret, aldrig en `NEXT_PUBLIC_*`-variabel. `/health` er offentlig; `/solve` kræver Bearer-nøglen. Tjenesten behandler én beregning ad gangen og svarer 429, når den er optaget. Sørg for mindst 125 sekunders HTTP-timeout hos proxyen. Computation er begrænset til 100 sekunder plus indlæsning/modelopbygning og højst 200 deltagere; der afskæres ikke en vilkårlig del af deltagerlisten.

Der sendes kun interne spiller-ID'er, medlemsnumre (til forbudsregler), CR, køn, alder, tilmeldingsrækkefølge, status og tilmeldingstider samt hold-ID'er fra historikken. Navne, e-mailadresser, telefonnumre og loginoplysninger sendes ikke til beregningstjenesten.

## Regler og mål

- Styrke = 10 − CR. Alle deltagere i samme kamp må højst have 3 i CR-forskel.
- Kun tilmeldte starttider og de eksisterende banereservationer anvendes. En kamp varer 60 minutter. Både spillere og baner kontrolleres for overlap.
- Låste kampe bevares, men ugyldige låste kampe afvises; andre kladdeversioner erstattes ved gemning.
- Alle tre forbudte medlemspar kontrolleres, uanset hold.
- Single er tilladt både med samme køn og på tværs af køn. Alle singler har mix-værdi 5, så FactorMix=50 giver −150 point før øvrige fradrag. Timeønsker prioriteres før score, også når ekstra kampe giver negativ score. Ved to mænd og to kvinder i double fordeles kønnene ligeligt mellem holdene.
- Score følger de seks vægte. Hvert gentaget makkerpar giver straf én gang pr. historikregel; sidste rundes makkere giver begge makkerstraffe. Hver gentaget modstanderrelation giver separat straf. Flere kampe med samme relation i en historikrunde tælles som TRUE én gang.
- balanceAge = abs(A−B) + abs(C−D) + abs(A+B−C−D). Ved single bruges kun forskellen mellem de to spilleres alder.
- Historikken er de seneste tre **afholdte, offentliggjorte runder** fra og med 2026-09-18, før den valgte runde og før dags dato. Test- og aflyste runder og runder uden kampe udelades; arkiverede spillede runder tæller med. “Sidste uge” betyder den seneste af disse runder. Algoritmens egne planer gemmer stabile spiller-ID'er; ældre Excel-historik matches entydigt på fulde navne. Ukendte eller tvetydige navne stopper beregningen med besked.

CP-SAT løser følgende mål i rækkefølge. Det opnåede resultat for hvert trin er en nedre grænse: senere trin må forbedre det, men aldrig forringe det. Tidspunkter og hold må omarrangeres:

1. Maksimér antallet af aktive spillere med mindst 1 time.
2. Maksimér antallet med mindst 2 timer, derefter mindst 3 timer, uden at overskride ønsker.
3. Prioritér tilmeldingsrækkefølgen blandt de aktive: hver tildelt time vægtes med omvendt placering i køen. En tidligere tilmeldt har dermed højere prioritet, når opfyldelsen af trin 1–2 er ens.
4. Udfør samme tre time-trin og køprioritet for ventelisten. Ventelistedeltagere må allerede indgå som medspillere, hvis det hjælper de aktive; deres egne ønsker prioriteres først her.
5. Maksimér summen af kampscorer.
6. Maksimér spiller-timer ved den tidligste start, derefter ved hver senere start, uden at forringe tidligere mål.

De tre time-trin optimeres samlet pr. status med heltalsvægte: ved n spillere er første time vægtet (n+1)², anden time n+1 og tredje time 1. Dermed kan alle senere timer tilsammen ikke opveje én mistet første time. Timefordelingen får op til 20 sekunder, køprioritet 5 sekunder, score 40 sekunder og tidlige tider samlet 10 sekunder inden for de 100 sekunder. De almindelige syv starttider vægtes tilsvarende leksikografisk i ét trin, så modelbehandlingen ikke skal gentages for hver starttid.

Time-, kø- og scoretrin har op til to søgestarter med forskellige tilfældige seeds. Den bedste komplette løsning genbruges som startforslag og kan ikke tabes ved genstart. Antallet af solvertråde tilpasses antallet af CPU'er, højst fire. Ved tidsgrænsen bevares den bedste fundne gyldige løsning, og UI viser **optimalitet er ikke bevist**. Kun når alle trin er bevist optimale, bruges **Optimal løsning fundet**. Flere søgestarter giver ikke garanti for et globalt optimum.

**Ikke opfyldte ønsker** beregnes fra den aktuelt viste kampplan og de aktuelle tilmeldinger. Listen viser ønskede, tildelte og manglende timer, mulige og tildelte starttider samt status. Den tilføjes efter en tom række under kampene i Kampplan.xlsx; importen læser fortsat kun kampene. Ens medlemsnavne markeres til manuel kontrol.

En lokal analyse uden databaseændringer kan køres med `dotnet optimizer-service/bin/Debug/net10.0/OptimizerService.dll --solve-file input.json result.json`. Input følger `/solve`-formatet. Gem virkelige medlemsdata under den git-ignorerede mappe `work/`.

## Kontrol og test

`FactorSameTeamDifference` har standardværdien 15 og kan ændres sammen med de andre faktorer i Kampplan Admin. Fra kampscoren trækkes `FactorSameTeamDifference * (abs(CR1_hold1 - CR2_hold1) + abs(CR1_hold2 - CR2_hold2))`. For single er dette fradrag 0. Faktoren supplerer `FactorMatchDifference`, som vægter forskellen mellem holdenes samlede CR. Værdien 0 deaktiverer det nye fradrag. Ved udgivelse skal både denne .NET-tjeneste og appen opdateres, så solver og scorekontrol bruger samme formel.

`npm run optimizer:test` tester CP-SAT. `node --test tests/optimizer.test.mjs tests/optimizer-api.test.mjs` tester den uafhængige TypeScript-validator og hele forløbet fra API gennem den rigtige .NET-tjeneste til en isoleret D1.

API'et kontrollerer rettigheder, lukket tilmelding, datagyldighed, kampscore og alle hårde kampregler. Forslagets fingeraftryk omfatter medlemmer, tilmeldinger, banekampe, historik og vægte. Gemning bruger en atomisk D1-batch med en betinget opdatering: samtidige ændringer betyder, at hverken den gamle kladde eller kamprækkerne overskrives.

Referencer: [Google OR-Tools CP-SAT](https://developers.google.com/optimization/cp/cp_solver), [OR-Tools til .NET](https://developers.google.com/optimization/install/dotnet/).
