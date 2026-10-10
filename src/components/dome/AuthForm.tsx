import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabase } from "@/lib/supabase";
import { Brand } from "./Brand";
import { ConfigNotice } from "./ConfigNotice";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const sb = getSupabase();
      if (mode === "register") {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
            emailRedirectTo: `${window.location.origin}/cekani`,
          },
        });
        if (error) throw error;
        if (!data.session) {
          setInfo("Poslali jsme vám e-mail k potvrzení. Poté vaši registraci schválíme.");
          return;
        }
        navigate({ to: "/cekani" });
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/prace" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Něco se nepovedlo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col px-5 py-6">
      <Brand />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 py-10">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {mode === "login" ? "Vítejte zpět" : "Založit účet"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {mode === "login"
              ? "Přihlaste se a pokračujte ve svých případech."
              : "Po registraci váš účet ověříme a zpřístupníme."}
          </p>
        </div>
        <ConfigNotice />
        <form onSubmit={submit} className="space-y-4">
          {mode === "register" && (
            <div className="space-y-2">
              <Label htmlFor="name">Jméno</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-12"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Heslo</Label>
            <Input
              id="password"
              type="password"
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-12"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {info && <p className="text-sm text-primary">{info}</p>}
          <Button type="submit" disabled={busy} className="h-12 w-full text-base">
            {busy ? "Chvilku…" : mode === "login" ? "Přihlásit se" : "Zaregistrovat se"}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          {mode === "login" ? (
            <>
              Nemáte účet?{" "}
              <Link
                to="/registrace"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Registrace
              </Link>
            </>
          ) : (
            <>
              Už máte účet?{" "}
              <Link
                to="/prihlaseni"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Přihlášení
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
