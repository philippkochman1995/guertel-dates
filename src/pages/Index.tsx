import { useMemo } from 'react';
import type { Event } from '@/types/event';
import DaySection from '@/components/DaySection';
import { getTodayISO } from '@/lib/dates';
import eventsData from '@/data/events.json';

const Index = () => {
  const groupedEvents = useMemo(() => {
    const today = getTodayISO();
    const futureEvents = (eventsData as Event[])
      .filter((e) => e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    const groups: Map<string, Event[]> = new Map();
    for (const event of futureEvents) {
      const existing = groups.get(event.date) || [];
      existing.push(event);
      groups.set(event.date, existing);
    }
    return groups;
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="pt-12 md:pt-16 pb-16 md:pb-20 px-6 md:px-8 max-w-[800px] mx-auto">
        <h1 className="text-xs tracking-[0.3em] uppercase font-medium">
          Musik Am Gürtel
        </h1>
      </header>

      <main className="px-6 md:px-8 max-w-[800px] mx-auto pb-20">
        {groupedEvents.size === 0 ? (
          <p className="text-sm uppercase tracking-widest text-muted-foreground">
            Keine kommenden Events
          </p>
        ) : (
          Array.from(groupedEvents.entries()).map(([date, events]) => (
            <DaySection key={date} date={date} events={events} />
          ))
        )}
      </main>

      <footer className="px-6 md:px-8 max-w-[800px] mx-auto pb-12 border-t border-border pt-8">
        <p className="text-xs text-muted-foreground tracking-wide">
          Täglich aktualisiert. Keine Werbung. Keine Daten.
        </p>
      </footer>
    </div>
  );
};

export default Index;
