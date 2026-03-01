# implementation-plan.md

## Build philosophy

Ship minimal. One venue first. Static-first. Daily rebuild only.

## Phases

### Phase 0 --- Setup

-   Initialize Vite + React + TypeScript
-   Install Tailwind
-   Configure typography + 8pt grid

### Phase 1 --- Static rendering

-   Define Event interface
-   Render grouped chronological homepage
-   Hide past events

### Phase 2 --- Scraper

-   Create chelsea.ts
-   Parse title, date, time, description, URL
-   Normalize to Event

### Phase 3 --- Unified build

-   Merge scrapers
-   Deduplicate
-   Remove past events
-   Sort
-   Write events.json

### Phase 4 --- Automation

-   Add daily cron
-   Auto-build + deploy
