# Admin og SuperAdmin

Admin er klubbens lokale administrator og beholder medlemsadministration,
tilmeldinger, kampplaner, privatlivsopgaver og nyhedsmails.

SuperAdmin har derudover sin egen fane med **Standard for kampplan**,
**CPU og tid for optimering** og **Test e-mail**. Kampfaktorer i selve
optimeringspanelet kan også kun ændres af SuperAdmin. En lokal Admin kan stadig
beregne, gemme og redigere kampplaner med serverens gemte faktorer.

## Kontobinding

Adgangen er en ekstra serverkontrolleret rettighed oven på den eksisterende
adminrolle. `SUPERADMIN_PLAYER_ID` i servermiljøet skal være profilens stabile
interne ID, ikke medlemsnummer eller navn. Navneændring giver aldrig denne adgang.
Den lokale konto med medlemsnummer 13993 er verificeret som profil-ID 2.
Andre installationer skal kontrollere deres egen konto og deres eget ID.

Den eksisterende databaserolle bevares for kompatibilitet med booking, login,
privatliv og mail. Den beregnede `isSuperAdmin`-rettighed kommer fra serveren og
accepteres aldrig fra en klientanmodning. En manglende eller ugyldig konfiguration
giver ingen SuperAdmin. Kontoen skal være åben og have adminrollen.

Lokale administratorer kan ikke ændre SuperAdmins profiloplysninger eller fjerne
adgangen. SuperAdmin kan heller ikke fjerne sin egen adgang via den almindelige
administratorliste; kontobinding ændres af driftsansvarlig i servermiljøet.

## Beskyttede oplysninger

Faktorer og ressourceindstillinger returneres ikke til lokal Admin fra app-API'et.
Faktormetadata fjernes fra kampplanens rå data for alle andre end SuperAdmin.
Optimerings-API'et afviser lokale faktoroverskrivninger og returnerer ikke vægte
eller beregningsstadier til lokal Admin. Faktorstandarder og hjælpetekster hentes
fra serveren for SuperAdmin, frem for at være indlejret i de fælles faktorformularer.
Almindelige kampresultater, validering og kampscorer er fortsat en del af klubdriften.

Dette indfører ikke datamæssig isolation mellem flere klubber i samme database.
Den eksisterende app er fortsat én klub pr. installation. Brug separate
installationer/databaser, indtil en egentlig flerklubmodel er implementeret.

## Drift og kontrol

Den lokale `.dev.vars` konfigureres for den verificerede konto. Filen og dens backup
er ignoreret af Git. Produktionsmiljøet er ikke ændret eller publiceret; dér skal
driftsansvarlig sætte `SUPERADMIN_PLAYER_ID` efter at have verificeret kontoen.
Der kræves ingen databaseændring for rolleopdelingen.

API-regressionen kontrollerer begge adgangsniveauer, beskyttelse af ejerkontoen,
fravær af faktorværdier for lokal Admin og optimeringens eksisterende funktion.
Ingen rigtige mails sendes under testen.
