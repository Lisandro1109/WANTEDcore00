"use client";

import { useEffect, useState } from "react";
import { accountEmailLocal, t, toAccountEmail, type MemberPermissions } from "@wanted/shared";
import { api } from "@/lib/api";
import { notify } from "@/lib/notify";
import { EmailField } from "../../email-field";
import type { Grant } from "../shell";
import { SettingsModal } from "./modal";
import {
  attachTables,
  draftFromPermissions,
  emptyDraft,
  PermissionEditor,
  permissionsFromDraft,
  summary,
  type AccessOptions,
  type PermissionDraft,
} from "./permissions";

type Member = {
  id: string;
  name: string;
  email: string;
  status: "active" | "suspended";
  permissions: MemberPermissions;
};

export function MembersSection({ grants, actorId }: { grants: Grant[]; actorId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [options, setOptions] = useState<AccessOptions | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);

  const canMembers = ["view", "create", "manage"].some((action) => allows(grants, "members", action));
  const canCreate = allows(grants, "members", "create") || allows(grants, "members", "manage");
  const canManage = allows(grants, "members", "manage");

  async function load() {
    const [memberResponse, optionResponse] = await Promise.all([
      api("/api/workspace/members"),
      canCreate ? api("/api/workspace/members/access-options") : Promise.resolve(null),
    ]);
    if (memberResponse.ok) {
      setMembers((await memberResponse.json()) as Member[]);
    }
    if (optionResponse?.ok) {
      setOptions((await optionResponse.json()) as AccessOptions);
    }
    setLoaded(true);
  }

  useEffect(() => {
    if (!canMembers) {
      return;
    }
    void load();
  }, [canMembers]);

  function done(message: string) {
    notify({ title: message, tone: "success", source: t("modules.settings") });
  }

  return (
    <div className="settings-block">
      <div className="settings-toolbar">
        <span className="settings-count">
          {members.length === 1 ? t("settings.memberOne") : `${members.length} ${t("settings.memberMany")}`}
        </span>
        {canCreate ? (
          <button className="raised-button" type="button" onClick={() => setCreating(true)}>
            <PlusIcon />
            {t("members.create")}
          </button>
        ) : null}
      </div>

      {canMembers && loaded && members.length === 0 ? (
        <div className="settings-empty">
          <p>{t("members.empty")}</p>
          <p className="muted">{t("settings.membersEmptyHint")}</p>
        </div>
      ) : null}

      {members.length > 0 ? (
        <ul className="settings-list">
          {members.map((member) => (
            <li key={member.id} className={member.status === "active" ? "settings-row" : "settings-row is-off"}>
              <span className="settings-avatar" aria-hidden="true">
                {initials(member.name)}
              </span>
              <span className="settings-row-main">
                <strong>{member.name}</strong>
                <span>{member.email}</span>
              </span>
              <span className="settings-chip">{summary(member.permissions)}</span>
              <span className={member.status === "active" ? "settings-status is-on" : "settings-status"}>
                {member.status === "active" ? t("accounts.active") : t("accounts.suspended")}
              </span>
              {canManage && member.id !== actorId ? (
                <button
                  className="settings-icon-button"
                  type="button"
                  aria-label={`${t("members.edit")} ${member.name}`}
                  title={t("members.edit")}
                  onClick={() => setEditing(member)}
                >
                  <PencilIcon />
                </button>
              ) : (
                <span className="settings-icon-spacer" aria-hidden="true" />
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {creating ? (
        <ChildForm
          options={options}
          onClose={() => setCreating(false)}
          onCreated={async (text) => {
            setCreating(false);
            done(text);
            await load();
          }}
        />
      ) : null}

      {editing ? (
        <MemberForm
          member={editing}
          options={options}
          onClose={() => setEditing(null)}
          onSaved={async (text) => {
            setEditing(null);
            done(text);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function MemberForm({
  member,
  options,
  onClose,
  onSaved,
}: {
  member: Member;
  options: AccessOptions | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(accountEmailLocal(member.email));
  const [password, setPassword] = useState("");
  const [draft, setDraft] = useState<PermissionDraft>(() => {
    const base = draftFromPermissions(member.permissions);
    return options ? attachTables(base, member.permissions, options) : base;
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = member.status === "active";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const accountEmail = toAccountEmail(email);
    if (!accountEmail) {
      setError(t("auth.emailInvalid"));
      return;
    }
    setBusy(true);
    try {
      const response = await api(`/api/workspace/members/${member.id}`, {
        method: "POST",
        body: JSON.stringify({ name, email: accountEmail, password, permissions: permissionsFromDraft(draft) }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(body.message ?? t("api.invalidBody"));
        return;
      }
      await onSaved(t("members.updated"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    setError("");
    setBusy(true);
    try {
      const response = await api(`/api/workspace/members/${member.id}/${active ? "suspend" : "activate"}`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        setError(body.message ?? t("api.invalidBody"));
        return;
      }
      await onSaved(active ? t("settings.memberSuspended") : t("settings.memberActivated"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsModal title={t("settings.editMember")} onClose={onClose} wide>
      <form className="settings-form" onSubmit={(event) => void submit(event)}>
        <div className="settings-fields is-pair">
          <label>
            <span>{t("admin.name")}</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <EmailField value={email} onChange={setEmail} />
          <label>
            <span>{t("auth.password")}</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              minLength={8}
              placeholder={t("members.passwordHint")}
            />
          </label>
        </div>
        <PermissionEditor draft={draft} options={options} onChange={setDraft} />
        {error ? <p className="settings-error">{error}</p> : null}
        <div className="settings-form-foot">
          <button className="ghost settings-quiet" type="button" disabled={busy} onClick={() => void toggleStatus()}>
            {active ? t("settings.suspendMember") : t("settings.activateMember")}
          </button>
          <button className="raised-button" type="submit" disabled={busy}>
            {t("members.save")}
          </button>
        </div>
      </form>
    </SettingsModal>
  );
}

function ChildForm({
  options,
  onClose,
  onCreated,
}: {
  options: AccessOptions | null;
  onClose: () => void;
  onCreated: (message: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [draft, setDraft] = useState<PermissionDraft>(emptyDraft);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const accountEmail = toAccountEmail(email);
    if (!accountEmail) {
      setError(t("auth.emailInvalid"));
      return;
    }
    setBusy(true);
    try {
      const response = await api("/api/workspace/members", {
        method: "POST",
        body: JSON.stringify({ name, email: accountEmail, password, permissions: permissionsFromDraft(draft) }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(body.message ?? t("api.invalidBody"));
        return;
      }
      await onCreated(t("members.created"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsModal title={t("members.create")} onClose={onClose} wide>
      <form className="settings-form" onSubmit={(event) => void submit(event)}>
        <div className="settings-fields is-pair">
          <label>
            <span>{t("admin.name")}</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
          </label>
          <EmailField value={email} onChange={setEmail} />
          <label>
            <span>{t("auth.password")}</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              minLength={8}
              required
            />
          </label>
        </div>
        <PermissionEditor draft={draft} options={options} onChange={setDraft} />
        {error ? <p className="settings-error">{error}</p> : null}
        <div className="settings-form-foot">
          <span />
          <button className="raised-button" type="submit" disabled={busy}>
            {t("members.create")}
          </button>
        </div>
      </form>
    </SettingsModal>
  );
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "·"
  );
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function allows(grants: Grant[], module: string, action: string) {
  return grants.some((grant) => grant.module === module && grant.action === action);
}
