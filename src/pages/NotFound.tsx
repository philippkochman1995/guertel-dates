import { Link } from "react-router-dom";

const NotFound = () => {
  return (
    <main className="min-h-screen px-6 md:px-8">
      <div className="mx-auto max-w-[780px] py-24">
        <h1 className="mb-6 text-4xl font-bold tracking-tight">404</h1>
        <Link
          to="/"
          className="text-xs uppercase tracking-[0.24em] text-foreground no-underline hover:underline transition-all duration-150"
        >
          BACK TO INDEX
        </Link>
      </div>
    </main>
  );
};

export default NotFound;
