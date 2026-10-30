# Project Planner

Een projectplanner die volledig offline werkt: Gantt-planning, bijeenkomsten en mijlpalen, projectteam met uurtarieven, weekuren en kosten. De hele app is **één zelfstandig HTML-bestand**. Je hebt geen server, account, CDN of internetverbinding nodig. Projecten worden bewaard als JSON-bestanden op je eigen computer of netwerkschijf.

## Snel starten

- **Gebruiken:** open `dist/Project Planner.html` met een dubbelklik in een moderne browser (Edge of Chrome), of start `Start Lokale Planner.bat`. Het HTML-bestand mag je naar een andere map of computer kopiëren.
- **Bouwen** (alleen nodig na een codewijziging; vereist [Node.js](https://nodejs.org/)):

  ```bash
  npm install
  npm run build   # maakt dist/Project Planner.html en dist/Project Planner - Alleen lezen.html
  npm test        # automatische tests van planning, team en kosten
  npm run check   # controleert dat beide HTML-bestanden echt zelfstandig zijn
  npm run dev     # ontwikkelserver met live herladen
  ```

## Werken met projectbestanden

- **Bestand > Nieuw** begint een leeg project. Via **Project & kalender** geef je het een naam, kies je werkdagen en voer je vrije dagen in.
- **Openen** leest een JSON-projectbestand. **Opslaan** (Ctrl+S) schrijft naar het geopende bestand als de browser dat ondersteunt. **Opslaan als** (Ctrl+Shift+S) kiest een ander bestand. Zonder bestandstoegang downloadt de browser een nieuw JSON-bestand.
- De browser bewaart daarnaast een herstelkopie (IndexedDB). De laatste sessie wordt bij opstarten hersteld. Dit vervangt opslaan niet.
- Ctrl+Z en Ctrl+Shift+Z maken de laatste 50 wijzigingen ongedaan of opnieuw.

### Delen via de netwerkschijf

Zet beide HTML-bestanden en het JSON-projectbestand op de netwerkschijf. Collega's openen **Project Planner - Alleen lezen.html** en kiezen het gedeelde JSON-bestand. In die kijkversie zijn bewerken, opslaan en slepen uitgeschakeld; inklappen, zoomen en details bekijken blijven werken. Geef alleen de projectleider schrijfrechten op het JSON-bestand: de kijkversie is een bedieningskeuze, geen beveiliging. Er is geen live synchronisatie; open het bestand opnieuw voor de laatste versie.

## Planning

- **Structuur:** groep > taak > subtaak. Gebruik **+** in een groepsrij voor een taak en **+** in een taakrij voor een subtaak. Groepen en taken met subtaken zijn in te klappen. Sleep de **⠿**-greep (of gebruik pijltjestoetsen) om groepen te herordenen.
- **Taken:** sleep een balk om hem te verplaatsen en de rechterrand om de duur te wijzigen. Dubbelklik of klik op de naam om te bewerken. In de taakmodal vul je een **startdatum** in en daarna óf een **duur in werkdagen** óf een **einddatum**; de andere waarde rekent mee. Duur 0 maakt een mijlpaal.
- **Dependencies:** klik **⌁** bij de voorganger en daarna bij de opvolger voor een FS-dependency. De taakeditor beheert alle typen (FS/SS/FF/SF) en vertraging in werkdagen. Pijlen lopen om taakbalken heen; als er geen vrije route is, wordt de lijn gestippeld.
- **Kleuren:** een taak zonder eigen kleur neemt de groepskleur over, een subtaak die van zijn taak.
- **Weergave:** zoom per dag, week of maand, of **Hele project**. Sleep de rechterrand van het takenpaneel om het breder of smaller te maken. Pas de **rijhoogte** aan met het schuifje in de werkbalk of door de onderrand van een rij te slepen. Dubbelklik op een rand zet de standaardwaarde terug. Deze weergave-instellingen worden per browser onthouden.

**Planningsregels:** datums zijn kalenderdatums zonder tijdzone; begin- en einddag tellen mee in de duur. Bij FS zonder vertraging begint de opvolger op de eerstvolgende werkdag na het einde van de voorganger. Positieve vertraging wacht extra werkdagen; negatieve vertraging laat overlap toe. Alleen geschonden voorwaarden schuiven taken naar later, en taken worden nooit automatisch korter. Cycli en dubbele verbindingen zijn ongeldig.

## Bijeenkomsten en mijlpalen

- De groep **Bijeenkomsten** heeft een rij per type: Projectteam, Stakeholders, Stuurgroep, Werksessie en Overig, elk met een eigen icoon. Een bijeenkomst is een moment op één dag, met optioneel tijd, locatie en notities.
- Voeg een los moment of een reeks toe (wekelijks of maandelijks, bijvoorbeeld iedere **derde donderdag**, met interval en einddatum). Iedere datum uit een reeks kan eigen dependencies hebben. Bijeenkomsten blijven op hun vaste datum; een te late voorganger geeft een waarschuwing.
- Een taak kan een **mijlpaal** (paars, volgt het taakeinde) of **deadline** (rood, vaste datum) aan het einde krijgen. Die verschijnen naast de balk en op de rij **Mijlpalen** onderaan.

## Projectteam en uren

- De tab **Projectteam** bevat teamleden met naam, rol en uurtarieven per periode. Begin- en einddatum tellen mee en periodes van één persoon mogen niet overlappen.
- In de taakmodal wijs je teamleden toe met ieder een eigen **urenbudget**. Het bedrag volgt de tarieven op de werkdagen van de taak. Ontbreekt een tarief, dan wordt het bedrag **onbekend** en nooit stilzwijgend nul.

## Bestedingen en kosten

Deze tab heeft vier weergaven:

| Weergave | Inhoud |
| --- | --- |
| **Totalen** | Per taak budget (afgesproken opbrengst), % gereed, gemaakte kosten, nog verwacht, verwacht totaal en winst/verlies. |
| **Per activiteit & teamlid** | Per teamlid het urenbudget, teambudget, geschreven uren, besteed bedrag, resterende uren en verbruik. |
| **Weekuren** | Per week, per activiteit en per teamlid de gewerkte uren, plus % gereed per activiteit. Bedoeld voor de projectleider. |
| **Vaste kosten** | Vrij toe te voegen regels voor reis- en verblijfkosten, rekencluster, druk- en printwerk enz. Ze kunnen aan een activiteit gekoppeld zijn of projectbreed gelden, met bedrag ex/incl BTW en BTW-percentage, en status *Gemaakt* of *Verwacht*. |

**Rekenregels**

- **Geschreven uren** = startsaldo (uren van vóór de weekregistratie) + alle weekuren.
- **Gemaakte kosten** worden berekend: geschreven uren × uurtarief per teamlid + gemaakte vaste kosten.
- **Nog verwacht** = je eigen prognose + verwachte vaste kosten.
- **Winst/verlies** = budget − (gemaakte kosten + nog verwacht).
- Alle totalen zijn **ex BTW**; incl BTW staat ter informatie bij de vaste kosten.
- Een lege cel betekent onbekend, niet nul. Bedragen worden in centen opgeteld.

Wijzigingen in deze tab pas je toe met **Wijzigingen toepassen**; sla daarna het projectbestand op.

## Projectbestand

Een projectbestand is JSON met `schemaVersion: 1`, `name`, `calendar`, `groups`, `tasks` en `dependencies`, aangevuld met:

- `tasks[].finances`: `{budget, remaining}`. `tasks[].teamAssignments`: `[{memberId, budgetHours, spentHours}]`, waarbij `spentHours` het startsaldo is.
- `teamMembers`: `[{id, name, role, rates: [{id, start, end, hourlyRate}]}]`.
- `timeEntries`: `[{week, taskId, memberId, hours}]`, met als `week` de datum van de maandag.
- `fixedCosts`: `[{id, description, category, taskId, date, status, amountExVat, vatRate}]`.
- `meetings` en `tasks[].endMilestone` voor bijeenkomsten en mijlpalen.

Bestanden zonder deze velden blijven werken. JSON-exports van de oudere Flask-versie van deze app worden bij openen omgezet.

> **Let op:** projectbestanden bevatten project- en klantgegevens. `.gitignore` sluit daarom alle `*.json` (behalve `package*.json`) uit van deze openbare repository.

## Techniek

React 19 en Vite 7. `build-offline.mjs` bouwt JavaScript, CSS en het lettertype Cabin (SIL Open Font License, meegeleverd via `@fontsource/cabin`) in één HTML-bestand in. De huisstijlkleuren staan in `src/hkv.css`. De rekenkern (`src/engine.js`, `team.js`, `summary.js`, `costs.js`, `weeks.js`) staat los van de interface en is getest met `node --test`.

## Licentie

[MIT](LICENSE)
