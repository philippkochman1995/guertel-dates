import type { Event } from '@/types/event';
import { formatDateLabel } from '@/lib/dates';
import EventEntry from './EventEntry';

interface DaySectionProps {
  date: string;
  events: Event[];
}

const DaySection = ({ date, events }: DaySectionProps) => {
  const label = formatDateLabel(date);

  return (
    <section className="mb-16 md:mb-20 animate-fade-in" aria-label={label}>
      <h1 className="text-2xl md:text-4xl font-bold uppercase tracking-tight mb-8 md:mb-10">
        {label}
      </h1>
      <div className="border-t border-border mb-8" />
      {events.map((event, i) => (
        <EventEntry key={`${event.title}-${event.time}-${i}`} event={event} />
      ))}
    </section>
  );
};

export default DaySection;
