# Scraper-Anleitung: Club Lucia

## Ziel

Für jedes Event sollen folgende Felder extrahiert werden:

1. Datum  
2. Event- / Bandname  
3. Bild  
4. Link zur Event-Detailseite  
5. Beschreibung (von der Detailseite)

Basis-URL (DE):
https://www.clublucia.at/de/

System: WordPress  
Plugin: WP Event Manager  

---

# 1) Pagination (Startseite ist paginiert)

Die Event-Übersicht ist klassisch paginiert.

URL-Schema:

/de/  
/de/page/2/  
/de/page/3/  

## Vorgehen

1. Seite 1 laden (`/de/`)
2. Events extrahieren
3. Seite inkrementieren (`/de/page/2/`, `/de/page/3/` …)
4. Stoppen wenn:
   - 404 zurückkommt
   - oder keine Events mehr gefunden werden

Empfehlung:
Solange eine Seite mindestens 1 Event enthält → nächste Seite laden.

---

# 2) Event-Container (Übersicht)

WP Event Manager rendert Events typischerweise als:

.event_listing

Alternativ prüfen:

ul.event_listings li

Robuster Selektor:

.event_listing

Jedes `.event_listing` entspricht einem Event.

---

# 3) Eventname + Link

Innerhalb eines Event-Containers:

Selektor:

.event_listing h3 a

Extraktion:

- Titel = textContent.trim()
- URL = href
- Relative URLs → absolute URL konvertieren

Event-URL-Muster:

/de/event/<slug>/

---

# 4) Datum (Übersicht)

Datum befindet sich typischerweise innerhalb:

.event-date  
.event-meta  
time  

Strategie:

1. `.event-date` prüfen
2. Falls nicht vorhanden → `time`-Tag prüfen
3. Falls nötig → Datum via Regex aus Text extrahieren

Datums-Pattern:

(\d{1,2})[.\s](\d{1,2}|\w+)[.\s](\d{4})

Empfehlung:
Datum zusätzlich von Detailseite validieren.

---

# 5) Bild (Übersicht)

Selektor:

.event_listing img

Extraktion:

- img.src
- Fallback: img.data-src

Falls kein Bild vorhanden:
OpenGraph-Fallback von Detailseite verwenden.

---

# 6) Detailseite scrapen

URL-Schema:

/de/event/<slug>/

Für jedes Event:

1. Detailseite laden
2. Titel, Datum, Beschreibung validieren
3. Bild ggf. überschreiben

---

# 7) Titel (Detailseite)

Primäre Selektoren:

h1  
.entry-title  

Fallback:

<title> (Suffix " - Club Lucia" entfernen)

---

# 8) Datum (Detailseite)

Prüfen:

.event-date  
time  
.event-meta  

Falls strukturiertes Datum fehlt:
Datum aus Text extrahieren.

Detailseite hat oft strukturierte Metadaten im Header.

---

# 9) Beschreibung (Detailseite)

Typische Container:

.entry-content  
.event-description  

Vorgehen:

1. Container selektieren
2. HTML bereinigen:
   - <br> → \n
   - </p> → \n\n
3. Text extrahieren
4. Whitespace normalisieren

---

# 10) OpenGraph-Fallback (sehr robust)

Falls DOM-Struktur bricht:

<meta property="og:title">
<meta property="og:description">
<meta property="og:image">

Fallback-Logik:

- Titel → og:title
- Beschreibung → og:description
- Bild → og:image

OpenGraph ist sehr stabil bei WordPress + Yoast SEO.

---

# 11) Deduplizierung

Events eindeutig identifizieren über:

event_url

Vor Speicherung:
Nach URL deduplizieren.

---

# 12) Empfohlene Datenstruktur

```json
{
  "location": "Club Lucia",
  "title": "Event Name",
  "date": "YYYY-MM-DD",
  "description": "Eventbeschreibung",
  "image": "https://www.clublucia.at/wp-content/uploads/...",
  "event_url": "https://www.clublucia.at/de/event/slug/"
}

# 13) Gesamt-Workflow

1. `/de/` laden

2. Alle `.event_listing` Elemente extrahieren

3. Pro Event aus der Übersicht sammeln:
   - Titel
   - Link zur Detailseite
   - Datum (falls vorhanden)
   - Bild

4. Pagination behandeln:
   - `/de/page/2/`
   - `/de/page/3/`
   - usw.
   - Solange Seiten Events enthalten → weiter inkrementieren

5. Für jedes gesammelte Event:
   - Detailseite laden
   - Beschreibung extrahieren
   - Datum von Detailseite validieren (Übersichtsdatum ggf. überschreiben)
   - OpenGraph-Fallback prüfen:
     - `og:title`
     - `og:description`
     - `og:image`

6. Events anhand der `event_url` deduplizieren

7. Ergebnisliste zurückgeben


---

# 14) Robustheits-Empfehlungen

- Stoppen, wenn eine paginierte Seite keine Events enthält
- Stoppen bei HTTP 404 auf `/de/page/X/`
- Defensive Selektoren verwenden (Fallback-Strategie einbauen)
- OpenGraph-Metadaten immer als Backup prüfen
- Fehler werfen, wenn insgesamt 0 Events extrahiert wurden
- Datumsparsing strikt validieren und in ISO-Format (`YYYY-MM-DD`) normalisieren