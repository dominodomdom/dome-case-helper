import { Link } from "@tanstack/react-router";

export function Brand() {
  return (
    <Link to="/" className="flex items-baseline gap-2">
      <span className="font-display text-lg font-semibold tracking-tight">DOME OS</span>
      <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold tracking-[0.18em] text-accent-foreground">
        ÚŘAD
      </span>
    </Link>
  );
}
