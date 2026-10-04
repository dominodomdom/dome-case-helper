import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/dome/AuthForm";

export const Route = createFileRoute("/registrace")({
  head: () => ({
    meta: [
      { title: "Registrace — DOME OS ÚŘAD" },
      { name: "description", content: "Založte si účet v DOME OS ÚŘAD — pomoc s dávkami a agendou Úřadu práce." },
      { property: "og:title", content: "Registrace — DOME OS ÚŘAD" },
      { property: "og:description", content: "Založte si účet v DOME OS ÚŘAD." },
    ],
  }),
  component: () => <AuthForm mode="register" />,
});
