import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { UradCase } from "@/lib/urad-api";

export function CaseCard({ item }: { item: UradCase }) {
  return (
    <Link
      to="/pripady/$id"
      params={{ id: item.id }}
      className="group flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{item.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {item.status ?? "Rozpracováno"}
          {item.createdAt && ` · ${new Date(item.createdAt).toLocaleDateString("cs-CZ")}`}
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-primary" />
    </Link>
  );
}
