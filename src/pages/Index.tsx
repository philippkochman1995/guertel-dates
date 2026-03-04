import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
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
  const futureEvents = useMemo(
    () => filterFutureEvents(eventsData as Event[], VIENNA_TIME_ZONE).sort(compareEventsChronologically),
    [],
  );
  const allLocations = useMemo(
    () => Array.from(new Set(futureEvents.map((event) => event.location))).sort((a, b) => a.localeCompare(b, 'de')),
    [futureEvents],
  );
  const [hiddenLocations, setHiddenLocations] = useState<string[]>([]);
  const hiddenLocationSet = useMemo(() => new Set(hiddenLocations), [hiddenLocations]);
  const filteredEvents = useMemo(
    () => futureEvents.filter((event) => !hiddenLocationSet.has(event.location)),
    [futureEvents, hiddenLocationSet],
  );
  const groupedEvents = useMemo(() => groupEventsByDate(filteredEvents), [filteredEvents]);

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
  const areAllLocationsVisible = hiddenLocations.length === 0;
  const [isVenueFilterOpen, setIsVenueFilterOpen] = useState(false);

  const toggleAllLocations = () => {
    setHiddenLocations((previous) => {
      if (previous.length === 0) {
        return [...allLocations];
      }

      return [];
    });
  };

  const toggleLocation = (location: string) => {
    setHiddenLocations((previous) => {
      if (previous.includes(location)) {
        return previous.filter((item) => item !== location);
      }

      return [...previous, location];
    });
  };
  const renderLocationFilter = () => {
    if (allLocations.length === 0) {
      return null;
    }

    return (
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setIsVenueFilterOpen(true)}
          className="inline-flex items-center gap-3 rounded-2xl border border-foreground/25 px-4 py-2 bg-background"
        >
          <span className="font-['Inter'] text-[1.05rem] leading-none">Filter venues</span>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  };

  useEffect(() => {
    if (allAnchorIds.length === 0) {
      setActiveAnchorId('');
      return;
    }

    const stickyOffsetPx = 184;

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

  useEffect(() => {
    if (!isVenueFilterOpen) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsVenueFilterOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isVenueFilterOpen]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <main className="w-full px-5 md:px-0 md:max-w-[700px] md:mx-auto pt-12 md:pt-16 pb-20 flex-1">
        <header className="mb-10">
          <div className="flex items-start justify-between gap-6">
            <h1 className="font-['Apfel_Grotezk_Fett'] text-[1.6875rem] leading-none uppercase tracking-[0.05em]">
              LIVE AM GÜRTEL
            </h1>
            <Link
              to="/about"
              className="font-['Inter'] text-[1.15rem] leading-none font-semibold mt-1 hover:underline"
            >
              About
            </Link>
          </div>
        </header>

        {futureEvents.length === 0 ? (
          <p className="text-sm uppercase tracking-widest text-muted-foreground font-normal">
            NO UPCOMING EVENTS
          </p>
        ) : groupedEvents.size === 0 ? (
          <>
            {renderLocationFilter()}
            <p className="mt-4 text-sm uppercase tracking-widest text-muted-foreground font-normal">
              NO EVENTS FOR SELECTED LOCATIONS
            </p>
          </>
        ) : (
          monthGroups.map((group) => {
            const jumpLinks = group.entries.map(([targetDate]) => ({
              href: `#date-${targetDate}`,
              label: formatJumpLabel(targetDate, todayIso, tomorrowIso),
            }));

            return (
              <section key={group.monthLabel}>
                <div className="sticky top-0 z-30 bg-background mb-7 md:mb-8 pt-2 pb-2">
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
                  {renderLocationFilter()}
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
      {isVenueFilterOpen ? (
        <div className="fixed inset-0 z-50 bg-black text-white">
          <div className="h-full overflow-y-auto px-5 md:px-0 md:max-w-[700px] md:mx-auto pt-6 pb-10">
            <div className="flex justify-end mb-6">
              <button
                type="button"
                onClick={() => setIsVenueFilterOpen(false)}
                className="font-['Inter'] text-[0.9rem] uppercase tracking-[0.12em] border border-white px-3 py-1 hover:bg-white hover:text-black transition-colors"
              >
                Close
              </button>
            </div>

            <button
              type="button"
              onClick={toggleAllLocations}
              className={`mb-5 inline-flex items-center gap-2 border px-3 py-1 text-[0.78rem] uppercase tracking-[0.12em] font-['Inter'] ${
                areAllLocationsVisible
                  ? 'border-white bg-white text-black'
                  : 'border-zinc-500 text-zinc-300 bg-zinc-800 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              All venues
            </button>

            <div className="flex flex-wrap gap-2">
              {allLocations.map((location) => {
                const isVisible = !hiddenLocationSet.has(location);

                return (
                  <button
                    key={location}
                    type="button"
                    aria-pressed={isVisible}
                    onClick={() => toggleLocation(location)}
                    className={`border px-3 py-2 font-['Inter'] text-[0.9rem] uppercase tracking-[0.08em] transition-colors ${
                      isVisible
                        ? 'border-white bg-white text-black'
                        : 'border-zinc-500 text-zinc-300 bg-zinc-800 hover:bg-zinc-700 hover:text-white'
                    }`}
                  >
                    {location}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Index;
