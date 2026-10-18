"use client";

import { useEffect, useState, type ReactNode } from "react";
import { t } from "@wanted/shared";
import { canOpen, useSpace } from "../shell";
import { MembersSection } from "./members";

type SectionKey = "usuarios";

type Section = {
  key: SectionKey;
  label: string;
  hint: string;
  icon: ReactNode;
};

function readHash(): SectionKey | null {
  const value = window.location.hash.replace("#", "");
  return value === "usuarios" ? value : null;
}

export default function SettingsPage() {
  const space = useSpace();
  const [active, setActive] = useState<SectionKey | null>(null);

  useEffect(() => {
    setActive(readHash());
    function onHash() {
      setActive(readHash());
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (!space) {
    return null;
  }
  const showMembers = canOpen(space.grants, "members");
  const showSettings = canOpen(space.grants, "settings");
  if (!showMembers && !showSettings) {
    return <p className="muted">{t("api.forbidden")}</p>;
  }

  const sections: Section[] = showMembers
    ? [{ key: "usuarios", label: t("members.title"), hint: t("settings.membersHint"), icon: <UsersIcon /> }]
    : [];
  const current = sections.find((section) => section.key === active) ?? sections[0] ?? null;

  function choose(key: SectionKey) {
    setActive(key);
    window.history.replaceState(null, "", `#${key}`);
  }

  return (
    <div className="settings">
      <header className="settings-head">
        <h1 className="module-title">{t("modules.settings")}</h1>
        <p className="muted">{t("settings.intro")}</p>
      </header>

      {sections.length === 0 ? (
        <p className="muted">{t("settings.nothing")}</p>
      ) : (
        <div className="settings-layout">
          <nav className="settings-nav" aria-label={t("modules.settings")}>
            {sections.map((section) => {
              const selected = section.key === current?.key;
              return (
                <button
                  key={section.key}
                  type="button"
                  className={selected ? "settings-nav-item is-active" : "settings-nav-item"}
                  aria-current={selected ? "page" : undefined}
                  onClick={() => choose(section.key)}
                >
                  <span className="settings-nav-icon" aria-hidden="true">
                    {section.icon}
                  </span>
                  <span className="settings-nav-label">{section.label}</span>
                </button>
              );
            })}
          </nav>

          {current ? (
            <section className="settings-panel stack" key={current.key} aria-labelledby="settings-panel-title">
              <div className="settings-section-head">
                <h2 id="settings-panel-title">{current.label}</h2>
                <p className="muted">{current.hint}</p>
              </div>
              {current.key === "usuarios" ? (
                <MembersSection grants={space.grants} actorId={space.actor.id} />
              ) : null}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1M17 11a2.5 2.5 0 1 0 0-5M21 19v-1a3.5 3.5 0 0 0-2.5-3.3" />
    </svg>
  );
}