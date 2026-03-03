import type { Event } from '@/types/event';
import EventEntry from './EventEntry';

interface DaySectionProps {
  date: string;
  events: Event[];
  anchorId?: string;
}

function getDateBadgeParts(date: string): { weekday: string; day: string } {
  const parsed = new Date(`${date}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
  }).formatToParts(parsed);

  const weekday = parts.find((part) => part.type === 'weekday')?.value?.toUpperCase() ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';

  return { weekday, day };
}

const DaySection = ({ date, events, anchorId }: DaySectionProps) => {
  const { weekday, day } = getDateBadgeParts(date);

  return (
    <section id={anchorId} className="mb-12 md:mb-16 animate-fade-in scroll-mt-[10rem]" aria-label={`${weekday} ${day}`}>
      <div className="grid grid-cols-[56px_1fr] md:grid-cols-[68px_1fr] gap-x-4 md:gap-x-6">
        <div className="sticky top-[10rem] self-start flex flex-col items-center text-center">
          <p className="font-['Apfel_Grotezk'] text-lime-300 text-[1.2344rem] leading-none mb-2">
            {weekday}
          </p>
          <p className="font-['Apfel_Grotezk_Mittel'] text-[2.635rem] leading-none">
            {day}
          </p>
        </div>

        <div className="space-y-8 md:space-y-10 min-w-0">
          {events.map((event, i) => (
            <EventEntry key={`${event.title}-${event.time}-${i}`} event={event} isFirst={i === 0} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default DaySection;
