# Administrator-2FA

Admin og Super Admin skal bekræfte PIN-login med TOTP (SHA-1, 6 cifre, 30 sekunder), fx Microsoft Authenticator eller Google Authenticator. Der bruges ingen betalt 2FA-tjeneste. QR-koden dannes i browseren; hemmeligheden sendes ikke til en QR-tjeneste.

## Før første deployment

1. Generér en kryptografisk tilfældig nøgle på 32 bytes, gengivet som 64 hex-tegn. Gem den i driftsansvarliges passwordmanager sammen med backupinstruktionerne. Brug fx `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` på en betroet computer. Del eller commit aldrig nøglen.
2. Kør `npx wrangler secret put MFA_ENCRYPTION_KEY --config wrangler.jsonc`, og indsæt nøglen i Wranglers prompt. Brug en anden nøgle end til lokal udvikling.
3. Kør den almindelige deploy. Release-scriptet kontrollerer, at hemmeligheden findes, før produktionsdata ændres. Migration `0021_admin_mfa.sql` tilføjer tabeller og sessionsmarkering. Eksisterende adminsessioner uden 2FA-markering afvises; administratorerne skal logge ind og opsætte 2FA.

Ved lokal udvikling: `node scripts/setup-mfa.mjs --local`, derefter den sædvanlige lokale databasemigrering og genstart af udviklingsserveren. Scriptet gemmer kun en ny lokal nøgle, hvis ingen findes; det udskriver aldrig nøglen.

**Udskift ikke krypteringsnøglen vilkårligt.** Eksisterende TOTP-hemmeligheder i databasen er AES-256-GCM-krypteret med denne nøgle. En databasebackup kræver den samme nøgle ved gendannelse. Ændring af nøglen kræver en særskilt kontrolleret genkryptering eller genopsætning af alle admin-konti.

## Brugerforløb

- Først PIN; dernæst en 10-minutters 2FA-udfordring uden adgang til appdata. Første gang vises QR-kode og manuel opsætningsnøgle. Opsætning aktiveres først efter en gyldig appkode.
- Ti tilfældige gendannelseskoder vises én gang. Hver kode kan bruges én gang i stedet for appkoden. Serveren gemmer kun hashes. Koderne skal gemmes, før brugeren fortsætter.
- “Husk denne enhed i 14 dage” er fravalgt som standard. En HttpOnly/Secure/SameSite-cookie og et servergemt tokenhash godkender kun anden faktor for den pågældende konto/browser. PIN kræves stadig. Udløbet forlænges ikke af brug.
- Profil → “Glem alle huskede enheder” tilbagekalder alle browsergodkendelser. Aktuelle login-sessioner fortsætter til logout/udløb; “Log ud på alle enheder” tilbagekalder både sessioner og huskede browsere.
- PIN-, rolle- og e-mailændringer tilbagekalder sessioner, igangværende udfordringer og huskede browsere på databaseniveau. PIN-nulstilling fjerner **ikke** 2FA-kravet.
- Profil → “Skift authenticator / få nye gendannelseskoder” kræver PIN og nuværende appkode/gendannelseskode. Når ny opsætning bekræftes, tilbagekaldes gamle sessioner, browsergodkendelser og gendannelseskoder.
- En appkode/tidscyklus accepteres kun én gang. Vent på næste kode, hvis den netop er brugt. Kodeforsøg begrænses både pr. konto/IP og pr. udfordring.

## Mistet adgang

Brug en gendannelseskode til login, og opsæt derefter en ny authenticator under Profil. Behold mindst én ekstra gendannelseskode til bekræftelsen af skiftet. Hvis en anden Admin har mistet både telefon og alle gendannelseskoder, kan Super Admin bruge SuperAdmin → Nulstil en anden Admins 2FA. Vælg personen, kontrollér identiteten via en uafhængig kanal, og bekræft med Super Admins egen PIN og en frisk 2FA-kode eller gendannelseskode. Nulstillingen tilbagekalder personens sessioner, huskede browsere, 2FA, gendannelseskoder og igangværende login-/PIN-nulstillingsforsøg. PIN og rolle bevares. Næste login kræver ny opsætning. Tidspunkt, aktør, mål og bekræftet identitetskontrol gemmes atomisk i security_mfa_events; PIN og koder logges aldrig. Super Admin kan ikke nulstille sin egen 2FA med denne funktion. Hvis Super Admin selv mister al adgang, kræves driftsansvarlig med databaseadgang og uafhængig identitetskontrol. Der er bevidst ingen anonym e-mail-genvej, der fjerner 2FA. Driftsansvarlig skal i én database-transaktion slette kontoens `sessions`, `trusted_devices`, `mfa_challenges` og `admin_mfa`, efter at kontoens interne ID er verificeret. Næste PIN-login kræver ny opsætning. Udfør aldrig dette på baggrund af en ubekræftet henvendelse.

Automatiske tests dækker RFC 6238-testvektorer, isoleret D1, opsætning, kontobinding, genbrug og samtidige forsøg, tidsgrænser, PIN-nulstilling, skift af authenticator og tilbagekaldelse. En fysisk scanning med Microsoft Authenticator bør indgå i driftsansvarliges accepttest før udrulning til alle administratorer.
