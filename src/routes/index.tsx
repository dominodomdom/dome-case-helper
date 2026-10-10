import { createFileRoute, Link } from "@tanstack/react-router";
import { Brand } from "@/components/dome/Brand";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DOME OS — ÚŘAD · Pomoc s agendou Úřadu práce" },
      {
        name: "description",
        content:
          "Pomoc s dávkami, příspěvky a řešením agendy Úřadu práce. DOME vás provede krok za krokem.",
      },
      { property: "og:title", content: "DOME OS — ÚŘAD" },
      {
        property: "og:description",
        content: "Pomoc s dávkami, příspěvky a řešením agendy Úřadu práce.",
      },
    ],
  }),
  component: Landing,
});

const TOPICS = [
  "Příspěvek na bydlení",
  "Dávky na živobytí",
  "Mimořádná okamžitá pomoc",
  "Odvolání",
  "Doplnění řízení",
  "Lhůty a dokumenty",
];

function Landing() {
  return (
    <div className="flex min-h-screen flex-col px-5 py-6 sm:px-10">
      <header className="flex items-center justify-between">
        <Brand />
        <Link
          to="/prihlaseni"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Přihlásit
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 py-16">
        <div className="space-y-6">
          <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
            Pomoc s dávkami, příspěvky a řešením agendy Úřadu práce.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
            Popište svou situaci vlastními slovy. DOME s vámi zjistí, co se stalo, které dokumenty
            jsou potřeba a jaké kroky následují.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            to="/registrace"
            className="flex h-14 items-center justify-center rounded-2xl bg-primary px-8 font-semibold text-primary-foreground hover:opacity-95"
          >
            Začít
          </Link>
          <Link
            to="/prihlaseni"
            className="flex h-14 items-center justify-center rounded-2xl border border-border px-8 font-medium hover:bg-muted"
          >
            Mám účet
          </Link>
        </div>
        <ul className="flex flex-wrap gap-2 pt-6">
          {TOPICS.map((t) => (
            <li
              key={t}
              className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground"
            >
              {t}
            </li>
          ))}
        </ul>
      </main>
      <footer className="text-xs text-muted-foreground">
        DOME OS · modul ÚŘAD · DOME neposkytuje právní rozhodnutí.
      </footer>
    </div>
  );
}
