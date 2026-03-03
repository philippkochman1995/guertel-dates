
# Scraper-Anleitung: Café Carina – Programmseite

## Ziel

Für jedes Event sollen folgende Felder extrahiert werden:

1. **Datum**
2. **Event- / Bandname**
3. **Bild**
4. **Link zur Event-Detailseite**
5. **Beschreibung** (von der Detailseite)

Basis-URL:
https://www.cafe-carina.at/2020/program/

---

# 1) Events auf der Übersichtsseite erfassen

Alle Events befinden sich in einzelnen Article-Containern.

## Event-Container

CSS-Selektor:
article.mec-event-article

Vorgehen:
- Alle `article.mec-event-article` selektieren
- Über die Liste iterieren

---

# 2) WICHTIG: "Load More" Button berücksichtigen

Die Seite verwendet einen dynamischen **Load More Button**.

Button-Klasse:
.mec-load-more-button

## Vorgehen für Scraper (wichtig bei Playwright / Puppeteer / Selenium)

1. Seite laden
2. Prüfen, ob Button `.mec-load-more-button` existiert
3. Button klicken
4. Warten, bis neue Events geladen sind
5. Wiederholen, bis:
   - Button nicht mehr existiert
   - oder Button disabled ist
   - oder keine neuen Events mehr erscheinen

### Pseudologik:
while (page.has(".mec-load-more-button")):
click(".mec-load-more-button")
waitForNetworkIdle()
waitForNewElements("article.mec-event-article")
⚠ Ohne wiederholtes Klicken werden nur die ersten Events geladen.

Wenn kein JS-Rendering verwendet wird:
- Alternativ Netzwerk-Requests analysieren
- Oder Pagination-Parameter untersuchen

---

# 3) Datum extrahieren

HTML-Struktur:
<div class="mec-event-date">02 März 2026</div>

CSS-Selektor:
.mec-event-date

Logik:
- element.textContent.trim()
- Optional: in ISO-Format (YYYY-MM-DD) umwandeln

---

# 4) Event- / Bandname extrahieren

HTML-Struktur:
<h4 class="mec-event-title">
    <a href="...">Monday Music</a>
</h4>

CSS-Selektor:
.mec-event-title > a

Logik:
- Titel = element.textContent.trim()

---

# 5) Bild extrahieren

Typische Struktur:
<div class="mec-event-image">
    <a href="...">
        <img src="..." ...>
    </a>
</div>

CSS-Selektor:
article.mec-event-article img

Logik:
- imageUrl = img.getAttribute("src")
- Falls Lazy Loading vorhanden:
  - fallback auf img.getAttribute("data-src")

---

# 6) Link zur Event-Detailseite

CSS-Selektor:
.mec-event-title > a[href]

Logik:
- url = element.getAttribute("href")
- Falls relative URL → in absolute URL konvertieren

---

# 7) Beschreibung von der Detailseite holen

Für jedes Event:

1. Detail-URL aufrufen
2. HTML parsen
3. Beschreibung extrahieren

## Beschreibung-Container

CSS-Selektor:
div.mec-single-event-description.mec-events-content

Wichtig:
Das Element hat BEIDE Klassen gleichzeitig.

Logik:
- description = element.textContent.trim()
- oder element.innerHTML (wenn Formatierung erhalten bleiben soll)

---

# 8) Optional: Filter-Logik

Die Seite enthält auch:
- "Sonntag Ruhetag"
- Event-ähnliche Einträge ohne Konzert

Optional:
- Titel prüfen
- Events mit "Ruhetag" ausschließen

---

# 9) Empfohlene Datenstruktur

JSON-Output pro Event:

{
  "date": "2026-03-02",
  "title": "Monday Music",
  "image": "https://example.com/image.jpg",
  "url": "https://www.cafe-carina.at/2020/events/...",
  "description": "Eventbeschreibung..."
}

---

# 10) Zusammenfassung der Selektoren

Event-Container:
article.mec-event-article

Load More Button:
.mec-load-more-button

Datum:
.mec-event-date

Titel + Link:
.mec-event-title > a

Bild:
article.mec-event-article img

Beschreibung (Detailseite):
div.mec-single-event-description.mec-events-content