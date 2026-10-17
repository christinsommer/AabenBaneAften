# Spillerpar som ikke må dele bane

Super Admin kan tilføje, ændre og fjerne par under SuperAdmin → Spillere som ikke må spille på samme bane. Vælg medlemmer med navn og medlemsnummer, og tryk Gem spillerpar. Samme medlem kan indgå i flere forskellige par; et par kan ikke indeholde samme medlem to gange eller gentages i omvendt rækkefølge.

Listen ligger i `forbidden_pairs` i installationens D1-database. Den nuværende arkitektur har én klub pr. installation/database; der er ikke indført deling af en database mellem flere klubber. En ny, tom klubdatabase får ingen HIK-regler. Migration `0023_forbidden_pairs.sql` overfører de tre eksisterende HIK-par i databaser med de berørte medlemmer, uden at ændre øvrige indstillinger.

Reglerne sendes med beregningsinput til optimeringstjenesten og gælder som hårde betingelser for både makkere og modspillere. Webappen kontrollerer også returnerede forslag og manuelt redigerede planer. Ændres listen under en beregning, afvises det gamle resultat ved gemning; start en ny beregning. Allerede gemte kampplaner ændres ikke automatisk.

Udrul både webappen, databasemigrationen og den opdaterede optimeringstjeneste. De gamle medlemsnumre findes kun som migrationsdata, ikke som faste regler i beregningskoden.
