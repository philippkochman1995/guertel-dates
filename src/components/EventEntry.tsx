import type { Event } from '@/types/event';

interface EventEntryProps {
  event: Event;
}

const EventEntry = ({ event }: EventEntryProps) => {
  return (
    <article className="mb-10">
      <p className="text-xs tracking-widest uppercase text-muted-foreground mb-1">
        {event.location} — {event.time}
      </p>
      <h2 className="text-xl md:text-2xl font-bold uppercase tracking-tight leading-tight mb-2">
        {event.title}
      </h2>
      <p className="text-sm leading-relaxed text-foreground/80 max-w-[720px] mb-2" style={{ lineHeight: '1.7' }}>
        {event.description}
      </p>
      <a
        href={event.event_url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs uppercase tracking-widest text-foreground no-underline hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2 transition-all duration-150"
      >
        Zur Quelle →
      </a>
    </article>
  );
};

export default EventEntry;
