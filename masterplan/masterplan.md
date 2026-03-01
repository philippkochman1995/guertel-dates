# masterplan.md

## 30-second elevator pitch

Musik Am Gürtel is a black-and-white editorial register for upcoming
concerts around Vienna's Gürtel. It updates daily. It shows only future
events. No archive. No filters. No personality. Just what's next.

## Problem & mission

### Problem

-   Event platforms are noisy and promotional.
-   Too many filters, images, and recommendations.
-   Regulars want a clean chronological overview.

### Mission

Publish a daily updated cultural register of upcoming Gürtel concerts.
Structured. Anonymous. Typographic.

## Target audience

-   Regular concert-goers around Vienna's Gürtel
-   Scene-adjacent creatives
-   Users who dislike commercial event platforms
-   People tracking upcoming live shows

## Core features

### Homepage --- Chronological Future Feed

-   Default view = today
-   Only events where date ≥ today
-   Chronologically ordered
-   Continuous vertical flow
-   No filters, search, or accounts

### Event Entry

Each event shows: - Location - Title (ALL CAPS, bold) - Description -
Time - Link to original event ("SOURCE")

## Tech stack

Frontend: Vite, React, TypeScript, Tailwind, shadcn/ui\
Build: Static generation, daily cron rebuild\
Hosting: Static host (Vercel, Netlify, GitHub Pages)

## Data model

Event: - location (string) - title (string) - description (string) -
date (ISO string) - time (string) - event_url (string)

Only future events are stored.

## Roadmap

MVP: Chelsea scraper + homepage\
V1: More venues + improved dedupe\
V2: Optional RSS/iCal
