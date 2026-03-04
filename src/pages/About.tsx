import { Link } from 'react-router-dom';

const About = () => {
  const venuesIncluded = [
    'Cafe Carina',
    'Chelsea',
    'Lucia',
    'Loop',
    'The Loft',
    'B72',
    'Weberknecht',
    'Cafe Concerto',
    'Kramladen',
    'Rhiz',
    'G5',
  ];

  const notYetIncluded = ['Fania Live', 'Coco'];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="w-full px-5 md:px-0 md:max-w-[700px] md:mx-auto pt-12 md:pt-16 pb-20">
        <header className="mb-12 flex items-start justify-between gap-6">
          <Link
            to="/"
            className="font-['Apfel_Grotezk_Fett'] text-[1.6875rem] leading-none uppercase tracking-[0.05em]"
          >
            LIVE AM GÜRTEL
          </Link>
          <span className="font-['Inter'] text-[1.15rem] leading-none font-semibold mt-1">
            About
          </span>
        </header>

        <div className="font-['Inter'] text-[1.05rem] leading-[1.65] space-y-8 text-foreground/95">
          <p>Guertel.live lists live events from venues along the Wiener Gürtel.</p>

          <p>
            The Gürtel is one of Vienna’s main streets, but in the music scene people usually mean
            the stretch between U6 Josefstädter Straße and U6 Thaliastraße when they say “I&apos;m
            getting wasted am Gürtel”. That’s where a bunch of small clubs and live venues sit
            right under the U6 tracks.
          </p>

          <p>
            We also included B72, because it’s basically around the corner, and G5, because it has
            a similar vibe.
          </p>

          <section className="space-y-3">
            <h2 className="font-['Apfel_Grotezk_Fett'] text-[1.35rem] leading-none tracking-[0.03em]">
              Venues included
            </h2>
            <div className="space-y-1">
              {venuesIncluded.map((venue) => (
                <p key={venue}>+ {venue}</p>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-['Apfel_Grotezk_Fett'] text-[1.35rem] leading-none tracking-[0.03em]">
              Not yet included (event calendars currently not updated)
            </h2>
            <div className="space-y-1">
              {notYetIncluded.map((venue) => (
                <p key={venue}>+ {venue}</p>
              ))}
            </div>
          </section>

        <section >
          <p>
            Created by <a href="https://www.studiovis.at">studio vis</a>
          </p>
        </section>
        </div>
      </div>
    </main>
  );
};

export default About;
