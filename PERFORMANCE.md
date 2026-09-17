# Drift på Cloudflare Free

Projektets `wrangler.jsonc` placerer appen på Worker `aabenbaneaften` med D1-binding `DB` og domænet `aabenbaneaften.dk`. Simply.coms eventuelle rolle som domæneudbyder ændrer ikke denne Workers CPU-grænse.

## Ændringer

- Forsidens fælles HTML bygges statisk. Personlige data hentes fortsat fra det dynamiske `/api/app` uden cache.
- Efter almindelige ændringer bruger browseren data fra POST-svaret og undgår en ekstra fuld GET. Login og oprettelse kontrollerer fortsat sessionens cookie med et separat kald.
- Automatisk opdatering sker hvert 60. sekund i stedet for hvert 30. sekund. Skjulte faner springes over, overlappende baggrundskald undgås, og gentagne fokusbegivenheder begrænses. Manuel opdatering er fortsat mulig.
- Excel-biblioteket indlæses først ved import eller eksport.
- Anonyme besøg springer kalenderlisteforespørgslen over. Spillere henter ikke upublicerede kampe. Navneopslag for udskiftninger bruger et Map, og datoformatering genbruger sin formatter.
- Uventede serversvar viser HTTP-status og Cloudflare Ray ID, når headeren findes. Kald genafsendes ikke automatisk, da en ændring kan være gemt, selv om svaret fejlede.
- Workers observability er slået til i konfigurationen og træder i kraft ved næste deployment.

## Find den konkrete årsag

Efter deployment: Åbn Cloudflare → Workers & Pages → `aabenbaneaften` → Observability. Sammenhold tidspunkt og Ray ID fra en fejl med Worker-loggen. Se efter `exceededCpu`/fejl 1102, exceptions og D1-fejl. Sammenlign CPU-tidens p50/p95/p99 og fejlandel før og efter ændringen, både for GET og POST. Lokal svartid er ikke et mål for Cloudflares CPU-tid.

Kontrollér også D1-databasens Metrics for daglige rows read/rows written. Free har 5 millioner læste og 100.000 skrevne rækker pr. dag; læste rækker omfatter scanninger, ikke kun de returnerede rækker. Eksisterende indeks dækker bl.a. sessiontokens, medlemsnumre, tilmelding pr. arrangement/spiller og kampe pr. arrangement/tid.

Workers Free har 10 ms CPU pr. kald og 100.000 kald pr. dag. En højere `limits.cpu_ms` ophæver ikke Free-planens grænse. Hvis loggen fortsat viser CPU-overskridelser, er Workers Paid (fra USD 5 pr. måned plus eventuelt overforbrug) en relevant mulighed. Betalt abonnement aktiveres separat; disse kodeændringer ændrer ikke abonnementet. PIN-hashens sikkerhed er bevaret.

Der er stadig tunge administrative svar med medlemsliste og historik. Hvis målinger viser, at disse rammer grænsen, er næste skridt separate API-kald til historik og medlemsadministration, som kun hentes, når fanerne åbnes.

## Udgivelse

Brug den eksisterende procedure i [DEPLOYMENT.md](./DEPLOYMENT.md). Der er ingen nye databasemigrationer. Ændringerne påvirker først brugerne efter deployment. Optimér ikke med en fælles cache af `/api/app`, da svarene indeholder personlige oplysninger.

Kilder (kontrolleret 16. september 2026):

- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
