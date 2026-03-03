import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Event } from '@/types/event';
import DaySection from '@/components/DaySection';
import { getTodayISOInTimeZone, VIENNA_TIME_ZONE } from '@/lib/dates';
import { compareEventsChronologically, filterFutureEvents, groupEventsByDate } from '@/lib/events';
import eventsData from '@/data/events.json';

function formatMonthLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    year: 'numeric',
  }).formatToParts(parsed);
  const month = parts.find((part) => part.type === 'month')?.value?.toUpperCase() ?? '';
  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  return `${month} ${year}`;
}

function formatJumpLabel(date: string, todayIso: string, tomorrowIso: string): string {
  if (date === todayIso) {
    return 'TODAY';
  }

  if (date === tomorrowIso) {
    return 'TOMORROW';
  }

  const parsed = new Date(`${date}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
  }).formatToParts(parsed);

  const weekday = parts.find((part) => part.type === 'weekday')?.value?.toUpperCase() ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  return `${weekday}, ${day}`;
}

const Index = () => {
  const groupedEvents = useMemo(() => {
    const futureEvents = filterFutureEvents(eventsData as Event[], VIENNA_TIME_ZONE).sort(compareEventsChronologically);
    return groupEventsByDate(futureEvents);
  }, []);

  const groupedEntries = Array.from(groupedEvents.entries());
  const todayIso = getTodayISOInTimeZone(VIENNA_TIME_ZONE);
  const tomorrowIso = (() => {
    const date = new Date(`${todayIso}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    const year = date.getUTCFullYear();
    const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${date.getUTCDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  })();
  const monthGroups = useMemo(() => {
    const groups: Array<{ monthLabel: string; entries: [string, Event[]][] }> = [];

    for (const entry of groupedEntries) {
      const [date] = entry;
      const monthLabel = formatMonthLabel(date);
      const lastGroup = groups[groups.length - 1];

      if (!lastGroup || lastGroup.monthLabel !== monthLabel) {
        groups.push({ monthLabel, entries: [entry] });
        continue;
      }

      lastGroup.entries.push(entry);
    }

    return groups;
  }, [groupedEntries]);
  const allAnchorIds = useMemo(() => groupedEntries.map(([date]) => `date-${date}`), [groupedEntries]);
  const [activeAnchorId, setActiveAnchorId] = useState<string>(allAnchorIds[0] ?? '');

  useEffect(() => {
    if (allAnchorIds.length === 0) {
      return;
    }

    const stickyOffsetPx = 160;

    const updateActiveFromScroll = () => {
      let current = allAnchorIds[0];

      for (const id of allAnchorIds) {
        const section = document.getElementById(id);
        if (!section) {
          continue;
        }

        const top = section.getBoundingClientRect().top;
        if (top - stickyOffsetPx <= 0) {
          current = id;
        } else {
          break;
        }
      }

      setActiveAnchorId(current);
    };

    const updateActiveFromHash = () => {
      const hashId = window.location.hash.replace('#', '');
      if (hashId && allAnchorIds.includes(hashId)) {
        setActiveAnchorId(hashId);
      }
    };

    updateActiveFromHash();
    updateActiveFromScroll();

    window.addEventListener('scroll', updateActiveFromScroll, { passive: true });
    window.addEventListener('hashchange', updateActiveFromHash);

    return () => {
      window.removeEventListener('scroll', updateActiveFromScroll);
      window.removeEventListener('hashchange', updateActiveFromHash);
    };
  }, [allAnchorIds]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <main className="w-full px-5 md:px-0 md:max-w-[700px] md:mx-auto pt-12 md:pt-16 pb-20 flex-1">
        <header className="mb-10">
          <h1 className="font-['Apfel_Grotezk_Fett'] text-[1.6875rem] leading-none uppercase tracking-[0.05em]">
            LIVE AM GÜRTEL
          </h1>
        </header>

        {groupedEvents.size === 0 ? (
          <p className="text-sm uppercase tracking-widest text-muted-foreground font-normal">
            NO UPCOMING EVENTS
          </p>
        ) : (
          monthGroups.map((group) => {
            const jumpLinks = group.entries.map(([targetDate]) => ({
              href: `#date-${targetDate}`,
              label: formatJumpLabel(targetDate, todayIso, tomorrowIso),
            }));

            return (
              <section key={group.monthLabel}>
                <div className="sticky top-0 z-30 bg-background mb-8 md:mb-10 pt-2 pb-1">
                  <h1 className="font-['Apfel_Grotezk_Fett'] text-[1.6875rem] leading-none uppercase tracking-[0.05em] mb-5">
                    {group.monthLabel}
                  </h1>
                  <div className="h-px w-full bg-foreground" aria-hidden="true" />
                  <nav aria-label="Jump to date" className="mt-4 border-b border-foreground/70 pb-4 overflow-x-auto">
                    <div className="flex items-center gap-8 min-w-max pr-2">
                      {jumpLinks.map((link) => (
                        <a
                          key={link.href}
                          href={link.href}
                          className={`font-['Inter'] text-[0.95rem] uppercase whitespace-nowrap hover:underline ${
                            activeAnchorId === link.href.slice(1) ? 'underline' : 'no-underline'
                          }`}
                        >
                          {link.label}
                        </a>
                      ))}
                    </div>
                  </nav>
                </div>

                {group.entries.map(([date, events]) => (
                  <DaySection key={date} date={date} events={events} anchorId={`date-${date}`} />
                ))}
              </section>
            );
          })
        )}
      </main>
      <footer className="w-full px-5 md:px-0 md:max-w-[700px] md:mx-auto pb-10">
        <div className="h-px w-full bg-foreground/40 mb-4" aria-hidden="true" />
        <Link
          to="/imprint"
          className="font-['Inter'] text-[0.78rem] uppercase tracking-[0.18em] underline hover:no-underline"
        >
          IMPRINT
        </Link>
      </footer>
    </div>
  );
};

export default Index;
