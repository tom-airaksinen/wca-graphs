# WCA Graphs

Statistik och grafer för en speedcubares tävlingsresultat, hämtade direkt ur World Cube Associations öppna API. Byggd för Aron (`2019AIRA01` är förvald profil), men vilken WCA-profil som helst går att välja.

Live: https://tom-airaksinen.github.io/wca-graphs/ – en annan profil öppnas med `?id=<WCA-id>`.

## Så funkar det

Vanilla PWA utan byggsteg: `index.html` (markup + CSS), `app.js` (logik överst, DOM och SVG-grafer nederst), `sw.js` (offline-cache).

Tre anrop per profil mot `https://www.worldcubeassociation.org/api/v0`, utan inloggning eller nyckel: `/persons/{id}` (personbästa och ranking), `/persons/{id}/results` (varje runda med alla försök) och `/persons/{id}/competitions` (datum och ort). Profilsökningen använder `/search/users?persons_table=true&q=`.

Tider är hundradelar; `-1` är DNF, `-2` DNS och `0` inget resultat. Fewest moves och multiblind har egna format, se `fmt()` i `app.js`.

## Vid ändring

Höj `APP_VERSION` i `app.js` och `CACHE` i `sw.js` till samma nummer. Kör `node test/kor.mjs`. Deploy är push till `main` (GitHub Pages).

Öppna frågor och idéer till nästa version ligger i `docs/oppna-fragor.md`.
