import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { getCase } from "@/lib/urad-api";
import { DomeWorkspace } from "@/components/dome/DomeWorkspace";

export const Route = createFileRoute("/_chraneno/pripady/$id")({
  head: () => ({
    meta: [{ title: "Detail případu — DOME OS ÚŘAD" }, { name: "robots", content: "noindex" }],
  }),
  component: CaseDetail,
});

function CaseDetail() {
  const { id } = Route.useParams();
  const q = useQuery({ queryKey: ["case", id], queryFn: () => getCase(id) });
  return (
    <div className="space-y-8">
      <Link
        to="/prace"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Moje případy
      </Link>
      {q.isPending && <p className="text-muted-foreground">Načítám…</p>}
      {q.isError && <p className="text-destructive">Případ se nepodařilo načíst.</p>}
      {q.data === null && <p className="text-muted-foreground">Případ nebyl nalezen.</p>}
      {q.data && (
        <>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{q.data.title}</h1>
          <DomeWorkspace item={q.data} />
        </>
      )}
    </div>
  );
}
