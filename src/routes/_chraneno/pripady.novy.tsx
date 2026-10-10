import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createCase } from "@/lib/urad-api";

export const Route = createFileRoute("/_chraneno/pripady/novy")({
  head: () => ({
    meta: [{ title: "Nový případ — DOME OS ÚŘAD" }, { name: "robots", content: "noindex" }],
  }),
  component: NewCase,
});

function NewCase() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const c = await createCase({ title: title || description.slice(0, 60), description });
      navigate({ to: "/pripady/$id", params: { id: c.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Případ se nepodařilo vytvořit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <Link
        to="/prace"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Zpět
      </Link>
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Popište, co se děje</h1>
        <p className="mt-2 text-muted-foreground">
          Vlastními slovy. Nemusíte znát úřední pojmy — zbytek zjistíme spolu.
        </p>
      </div>
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="d">Co se stalo?</Label>
          <Textarea
            id="d"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Např.: Úřad mi zamítl příspěvek na bydlení a nevím, co mám dělat."
            className="min-h-40 text-base leading-relaxed"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="t">Krátký název (nepovinné)</Label>
          <Input
            id="t"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-12"
            placeholder="Příspěvek na bydlení"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          type="submit"
          disabled={busy || !description.trim()}
          className="h-12 w-full text-base sm:w-auto sm:px-8"
        >
          {busy ? "Zakládám…" : "Pokračovat s DOME"}
        </Button>
      </form>
    </div>
  );
}
