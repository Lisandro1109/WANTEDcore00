"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { t, toAccountEmail } from "@wanted/shared";
import { api } from "@/lib/api";
import { EmailField } from "../email-field";
import { AppBar } from "../topbar";

type Parent = {
  id: string;
  name: string;
  email: string;
  status: "active" | "suspended";
  childCount: number;
  lastLoginAt: string | null;
};

const dateFormat = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" });

export default function AdminPage() {
  const router = useRouter();
  const [parents, setParents] = useState<Parent[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<{ id: string; name: string; email: string; image: string | null } | null>(null);

  async function load() {
    const response = await api("/api/platform/parents");
    if (response.status === 401 || response.status === 403) {
      router.push("/");
      return;
    }
    setParents((await response.json()) as Parent[]);
    setReady(true);
  }

  useEffect(() => {
    void load();
    void api("/api/me").then(async (response) => {
      if (response.ok) {
        setMe((await response.json()) as { id: string; name: string; email: string; image: string | null });
      }
    });
  }, []);

  async function createParent(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    const accountEmail = toAccountEmail(email);
    if (!accountEmail) {
      setMessage(t("auth.emailInvalid"));
      return;
    }
    const response = await api("/api/platform/parents", {
      method: "POST",
      body: JSON.stringify({ name, email: accountEmail, password }),
    });
    const body = (await response.json()) as { message?: string };
    if (!response.ok) {
      setMessage(body.message ?? t("api.invalidBody"));
      return;
    }
    setName("");
    setEmail("");
    setPassword("");
    setMessage(t("parents.created"));
    await load();
  }

  async function act(id: string, action: "suspend" | "activate", nextPassword?: string) {
    const path =
      action === "suspend"
        ? `/api/platform/parents/${id}/suspend`
        : `/api/platform/parents/${id}/activate`;
    const response = await api(action === "activate" && nextPassword ? `/api/platform/parents/${id}/access` : path, {
      method: "POST",
      body: nextPassword ? JSON.stringify({ password: nextPassword }) : undefined,
    });
    if (!response.ok) {
      const body = (await response.json()) as { message?: string };
      setMessage(body.message ?? t("api.invalidBody"));
      return;
    }
    setMessage(
      nextPassword ? t("parents.accessReset") : action === "suspend" ? t("parents.suspended") : t("parents.activated"),
    );
    await load();
  }

  return (
    <div className="shell">
      <AppBar
        section={t("admin.section")}
        userId={me?.id ?? ""}
        name={me?.name ?? ""}
        image={me?.image ?? null}
        settingsHref={null}
        profile={me ? { email: me.email, kind: "admin" } : undefined}
      />
      <main className="page stack">
        <form className="panel create-grid" onSubmit={(event) => void createParent(event)}>
          <label>
            {t("admin.name")}
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <EmailField value={email} onChange={setEmail} />
          <label>
            {t("auth.password")}
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              minLength={8}
              required
            />
          </label>
          <button type="submit">{t("admin.createParent")}</button>
        </form>
        {message ? <p className="muted">{message}</p> : null}
        <section className="stack">
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>{t("admin.parents")}</h1>
          {ready && parents.length === 0 ? <p className="muted">{t("admin.noParents")}</p> : null}
          {parents.map((parent) => (
            <ParentCard key={parent.id} parent={parent} onAct={act} />
          ))}
        </section>
      </main>
    </div>
  );
}

function ParentCard({
  parent,
  onAct,
}: {
  parent: Parent;
  onAct: (id: string, action: "suspend" | "activate", nextPassword?: string) => Promise<void>;
}) {
  const [nextPassword, setNextPassword] = useState("");

  return (
    <article className="panel parent">
      <div>
        <strong>{parent.name}</strong>
        <p className="muted">{parent.email}</p>
        <p className="muted">
          {parent.status === "active" ? t("accounts.active") : t("accounts.suspended")} · {t("admin.childCount")}{" "}
          {parent.childCount} · {t("admin.lastLogin")}{" "}
          {parent.lastLoginAt ? dateFormat.format(new Date(parent.lastLoginAt)) : t("admin.never")}
        </p>
      </div>
      <div className="actions">
        {parent.status === "active" ? (
          <button className="ghost" type="button" onClick={() => void onAct(parent.id, "suspend")}>
            {t("admin.suspend")}
          </button>
        ) : (
          <button className="ghost" type="button" onClick={() => void onAct(parent.id, "activate")}>
            {t("admin.activate")}
          </button>
        )}
        <input
          value={nextPassword}
          onChange={(event) => setNextPassword(event.target.value)}
          type="password"
          minLength={8}
          placeholder={t("admin.resetAccess")}
          aria-label={t("admin.resetAccess")}
        />
        <button
          className="ghost"
          type="button"
          disabled={nextPassword.length < 8}
          onClick={() => void onAct(parent.id, "activate", nextPassword).then(() => setNextPassword(""))}
        >
          {t("admin.savePassword")}
        </button>
      </div>
    </article>
  );
}
