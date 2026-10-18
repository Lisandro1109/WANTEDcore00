"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, toAccountEmail } from "@wanted/shared";
import { api } from "@/lib/api";
import { BrandLogo } from "./topbar";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const typed = email.trim().toLowerCase();
    const accountEmail = typed.includes("@") ? toAccountEmail(typed) : null;
    if (!accountEmail) {
      setPending(false);
      setError(t("auth.emailInvalid"));
      return;
    }
    const response = await api("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email: accountEmail, password }),
    });
    if (!response.ok) {
      setPending(false);
      setError(t("auth.invalid"));
      return;
    }
    const me = await api("/api/me");
    setPending(false);
    if (!me.ok) {
      setError(t("auth.invalid"));
      return;
    }
    const actor = (await me.json()) as { kind: string };
    router.push(actor.kind === "admin" ? "/admin" : "/espacio");
  }

  return (
    <main className="login">
      <form className="panel stack" onSubmit={onSubmit}>
        <div>
          <BrandLogo size="login" />
          <p className="muted">{t("auth.signIn")}</p>
        </div>
        <label>
          {t("auth.email")}
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            autoComplete="username"
            required
          />
        </label>
        <label>
          {t("auth.password")}
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            required
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={pending}>
          {t("auth.signIn")}
        </button>
      </form>
    </main>
  );
}
