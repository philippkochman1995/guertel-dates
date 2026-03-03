import type { Event } from '@/types/event';
import { useId } from 'react';

interface EventEntryProps {
  event: Event;
  isFirst?: boolean;
}

const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
const URL_ONLY_PATTERN = /^(https?:\/\/[^\s]+|www\.[^\s]+)$/i;

function normalizeUrl(url: string): string {
  return url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
}

function renderTextWithLinks(text: string) {
  const parts = text.split(URL_PATTERN);

  return parts.map((part, index) => {
    if (!part) {
      return null;
    }

    if (URL_ONLY_PATTERN.test(part)) {
      const href = normalizeUrl(part);
      return (
        <a
          key={`${href}-${index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline break-all"
        >
          {part}
        </a>
      );
    }

    return <span key={`text-${index}`}>{part}</span>;
  });
}

function normalizeDescription(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]*\n+/g, '\n')
    .trim();
}

const EventEntry = ({ event, isFirst = false }: EventEntryProps) => {
  const descriptionId = useId();
  const description = normalizeDescription(event.description);

  return (
    <article className={`${isFirst ? '' : 'mt-[1.875rem] '}min-w-0`}>
      <h2 className="font-['Apfel_Grotezk_Fett'] text-[1.3519rem] md:text-[2rem] uppercase tracking-[0.05em] leading-[1.1] mb-2 break-words">
        {event.title}
      </h2>
      <p className="font-['Inter'] font-semibold text-[0.8125rem] uppercase leading-tight mb-2 break-words">
        {event.location} | {event.time}
      </p>
      <p
        id={descriptionId}
        className="font-['Inter'] font-light opacity-70 text-[0.875rem] leading-[1.35] line-clamp-3 whitespace-normal break-words mb-0"
      >
        {renderTextWithLinks(description)}
      </p>
      <a
        href={event.event_url}
        target="_blank"
        rel="noopener noreferrer"
        aria-describedby={descriptionId}
        className="font-['Inter'] font-normal text-[0.835rem] underline hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2 transition-all duration-150"
      >
        more info
      </a>
    </article>
  );
};

export default EventEntry;
