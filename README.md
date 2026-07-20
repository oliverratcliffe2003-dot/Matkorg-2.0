# Vår Matkorg – GitHub Pages

Det här är ett komplett, fristående GitHub Pages-projekt med recept, lokala bilder, favoriter, varukorg, prisindikationer och mejlfunktion.

## Publicera som en helt ny GitHub-webbplats

1. Logga in på GitHub och välj **New repository**.
2. Ge repot ett namn, till exempel `var-matkorg`.
3. Välj **Public** och skapa repot.
4. Packa upp ZIP-filen och ladda upp **innehållet** i mappen. `index.html` måste ligga direkt i repots rot, inte i en extra undermapp.
5. Öppna **Settings → Pages**.
6. Under **Build and deployment**, välj **Deploy from a branch**.
7. Välj branch **main** och mapp **/(root)**. Spara.
8. Vänta någon minut och öppna länken som GitHub visar.

När du uppdaterar ett befintligt repo behöver du ersätta även mappen `images` och filerna `app.js`, `style.css`, `recipes.js` och `price-data.js`.

## Mejlfunktionen

Sidan använder FormSubmit via AJAX och skickar till:

- Oliver: `oliverratcliffe2003@gmail.com`
- Isabella: `isabellapanici@icloud.com`

Första gången en adress används kan FormSubmit skicka ett aktiveringsmejl som mottagaren måste godkänna. Direktmejl fungerar först när webbplatsen körs via `https://`, exempelvis på GitHub Pages. Det fungerar inte när `index.html` öppnas direkt från datorn.

## Prisuppgifter

Varje ingrediens visar:

- uppskattat genomsnittspris för en jämförbar förpackning
- prisindikation för Willys, ICA Maxi, Stora Coop och Hemköp
- beräknat inköpspris för mängden i varukorgen
- uppskattad totalsumma för hela inköpslistan

Prisuppgifterna i `price-data.js` är senast beräknade **20 juli 2026** för Göteborgsområdet. De är statiska prisindikationer, inte en livekoppling till butikernas kassasystem. Enskilda butiker, varumärken, kampanjer och medlemspriser kan ge andra priser.

Metoden använder produktbenchmark från Matpriser.nu och relativa kedjenivåer från Matpriskollens matkasseundersökning vecka 19 år 2026:

- https://www.matpriser.nu/jaemfoerelsen
- https://matpriskollen.se/aktuellt/2026/05/ny-matkasseundersokning-stora-prisskillnader-mellan-kedjor

För verkliga livepriser krävs en tillåten API- eller dataleverantörskoppling. GitHub Pages är statiskt och kan inte på egen hand läsa alla lokala butikspriser på ett tillförlitligt sätt.

## Filer

- `index.html` – sidans struktur
- `style.css` – design och mobilanpassning
- `recipes.js` – samtliga recept
- `price-data.js` – produktförpackningar och prisindikationer
- `app.js` – sökning, favoriter, priser, varukorg, delning och mejl
- `images/` – lokala receptbilder och favicon
- `CREDITS.md` – bildkällor och licenser

## Bildkrediter

Samtliga receptbilder är nu kopplade till rätt typ av maträtt. Källor och licenser finns i [CREDITS.md](CREDITS.md).
