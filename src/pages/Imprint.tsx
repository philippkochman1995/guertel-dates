const Imprint = () => {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="w-full px-5 md:px-0 md:max-w-[700px] md:mx-auto pt-12 md:pt-16 pb-20">
        <h1 className="font-['Apfel_Grotezk_Fett'] text-[1.6875rem] leading-none uppercase tracking-[0.05em] mb-10">
          IMPRINT
        </h1>
        <div className="space-y-3 font-['Inter'] text-[0.95rem]">
          <p>
            <a
              href="https://studiovis.at"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline"
            >
              Created by studio vis
            </a>
          </p>
          <p>Philipp Kochman</p>
          <p>
            <a href="mailto:start@studiovis.at" className="underline hover:no-underline">
              start@studiovis.at
            </a>
          </p>
        </div>
      </div>
    </main>
  );
};

export default Imprint;
