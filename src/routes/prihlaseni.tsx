import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/dome/AuthForm";

export const Route = createFileRoute("/prihlaseni")({
  head: () => ({
    meta: [
      { title: "Přihlášení — DOME OS ÚŘAD" },
      { name: "description", content: "Přihlaste se do DOME OS ÚŘAD a pokračujte v řešení svých případů." },
      { property: "og:title", content: "Přihlášení — DOME OS ÚŘAD" },
      { property: "og:description", content: "Přihlaste se do DOME OS ÚŘAD." },
    ],
  }),
  component: () => <AuthForm mode="login" />,
});
