import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { listCases } from "@/lib/urad-api";
import { CaseCard } from "@/components/dome/CaseCard";

export const Route = createFileRoute("/_chraneno/prace")({
  head: () => ({ meta: [{ title: "Moje případy — DOME OS ÚŘAD" }, { name: "robots", content: "noindex" }] }),
  component: Dashboard,
});

function Dashboard() {
  const q = useQuery({ queryKey: ["cases"], queryFn: listCases });
  return (
    <div className="space-y-12">
      <section className="space-y-6 pt-4">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          S čím vám dnes můžeme pomoct?
        </h1>
        <Link
          to="/pripady/novy"
          className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold tracking-wide text-primary-foreground shadow-sm transition hover:opacity-95 sm:w-auto sm:px-10 sm:inline-flex"
        >
          <Plus className="h-5 w-5" /> ZAČÍT ŘEŠIT PŘÍPAD
        </Link>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Vaše případy</h2>
        {q.isPending && <p className="text-muted-foreground">Načítám…</p>}
        {q.isError && (
          <p className="text-destructive">
            Případy se nepodařilo načíst.
            {q.error instanceof Error && <span className="block text-xs opacity-80">{q.error.message}</span>}
          </p>
        )}
        {q.data?.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground">
            Zatím nemáte žádný případ.
          </p>
        )}
        <div className="space-y-3">
          {q.data?.map((c) => <CaseCard key={c.id} item={c} />)}
        </div>
      </section>
    </div>
  );
}
