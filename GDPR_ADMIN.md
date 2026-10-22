# Privatliv og nyhedsmails – administratorvejledning

Funktionerne bruger den eksisterende Admin-rolle. Opdeling i Admin/SuperAdmin er ikke indført.

## Privatliv & inaktive profiler

Find fanen i Admin. Den virker også, når kalenderen ikke har kommende spilledage.
Alarmen viser profiler, der skal vurderes: 24 måneders dokumenteret inaktivitet
eller ukendt historisk aktivitet. Standarddatoen 25. september 2026 er mærket som
ukendt aktivitet; den er ikke et registreret besøg. Indloggede besøg og aktiv
betjening tæller som aktivitet. Der foretages ingen automatisk sletning.

1. Filtrér listen og kontrollér seneste aktivitet og tidligere vurderinger.
2. Vælg **Kontakt medlem**, redigér forslaget, og åbn mail, SMS eller telefon.
   Vælg selv korrekt afsender i mailappen. Linket registrerer ikke kontakt.
3. Når kontakten faktisk er gennemført, tilføj en relevant, kort note og tryk
   **Jeg har kontaktet medlemmet – registrér**. Administrator og tidspunkt gemmes.
4. **Behold profil** kræver begrundelse og fremtidig revurderingsdato. Det ændrer
   ikke medlemmets aktivitetsdato.
5. Brug **Afventer sletning/anonymisering** ved en uafklaret anmodning.
6. **Slet/anonymisér profil** viser relationer, konsekvenser og spærringer og
   kræver aktiv bekræftelse. Administratorer og kommende tilmeldinger er beskyttet.
   Tidligere tilmeldinger og kampe bevares og spærrer ikke lukning.

Kontrolleret lukning bruger fornavn **NN** og profil-ID som efternavn, fx
**NN 87**. Medlemsnummer erstattes med **closed-87**, så det oprindelige nummer
kan bruges til en ny profil. Spillehistorik, CR og den eksisterende CR-godkendelsesdato
bevares på den lukkede profil. Den lukkede profil vises ikke i Admins medlemsliste
eller CR-gennemgang, og CR kan ikke ændres gennem det almindelige Admin-API.
Kontaktoplysninger og login
fjernes. Matchende fulde navne i importerede kampplaner erstattes; profilens
feedbackkommentarer og kontaktnoter ryddes. Navnesammenfald og ulæselige planer
kræver afklaring. Nyhedsbrevstekster med navn/e-mail og igangværende afsendelse
spærrer fortsat. Forkortede navne, fritekst og eksterne arkiver skal gennemgås særskilt.
Dette er pseudonymisering, fordi historiske relationer kan identificere personen.
Eksterne filer, mailarkiver og backups skal også behandles.
En sletteanmodning skal vurderes konkret, også før inaktivitetsfristen.

Status **Kontaktet - afventer svar** betyder, at den faktiske kontakt er
registreret, men at der endnu ikke er truffet en endelig beslutning. Ved den
indledende gennemgang den 12. oktober 2026 blev alle aktive lokale profiler sat
til **Behold profil** med revurderingsdato to kalenderår efter profilens
oprettelsesdato. Lukkede profiler blev ikke ændret. Beslutningen er registreret i
vurderingshistorikken med SuperAdmin som aktør.

## Nyhedsmails

Medlemmer vælger selv nyhedsmails på Profil. Administrator kan ikke tilmelde
andre. E-mailændring kræver nyt samtykke til den nye adresse. Nødvendige
tilmeldings- og PIN-mails påvirkes ikke af nyhedsbrevsvalg.

1. Vælg **Opret nyhedsmail**. **Lav forslag** bruger kommende spilledage og en
   lokal tekstskabelon. Ingen medlemsdata sendes til en AI-tjeneste.
2. Redigér emne/tekst, gem kladden, og læs forhåndsvisningen. Mailen er ren tekst.
3. Kontrollér modtageroversigten og statusfilteret. Kun aktive profiler med
   dokumenteret samtykke til den aktuelle adresse indgår.
4. Bekræft antallet ved klargøring. En ekstra udsendelse inden for 30 dage kræver
   særskilt bekræftelse. Dette er en produktregel.
5. Send til én modtager ad gangen med **Kontrollér og send individuelt**.
   Modtagerens samtykke kontrolleres igen på serveren. Adresser deles ikke.
6. Arkivet indeholder en selvstændig indholdskopi, modtagere og status.
   **Kopiér som ny** opretter en ny kladde og ændrer ikke udsendelsen.

**Sendt** betyder accepteret af Resend. Appen har ingen leveringswebhook og
påstår ikke faktisk levering. Ved fejlet/usikkert forsøg skal mailudbyderen
kontrolleres. Der er ingen automatisk genafsendelse. Et afbrudt forsøg kan stå
som `sending`; det skal også undersøges, før en ny udsendelse overvejes.

Personlige links virker uden login. Åbning ændrer intet: medlemmet skal vælge
Afmeld eller Pause. Tokens må ikke kopieres til sager, logs eller fælles dokumenter.

Afsendelse kræver både den eksisterende `RESEND_API_KEY` og eksplicit
`NEWSLETTER_ENABLED=true` i det relevante Cloudflare-miljø. Funktionen er ikke
aktiveret eller afprøvet med rigtige modtagere som del af implementeringen.

Genoprettelse får altid et nyt profil-ID, nye læsekvitteringer og eventuelt nyt
nyhedsbrevssamtykke. Gentagen lukning giver forskellige closed-ID-numre.
Allerede lukkede profiler fra en ældre version er ikke ændret af denne kodelevering.
