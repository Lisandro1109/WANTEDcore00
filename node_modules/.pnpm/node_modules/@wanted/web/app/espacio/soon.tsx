"use client";

import { t } from "@wanted/shared";
import { canOpen, useSpace } from "./shell";

const moduleLabel: Record<"tables" | "crm" | "inbox" | "automations", "modules.tables" | "modules.crm" | "modules.inbox" | "modules.automations"> = {
  tables: "modules.tables",
  crm: "modules.crm",
  inbox: "modules.inbox",
  automations: "modules.automations",
};

export function Soon({ module }: { module: keyof typeof moduleLabel }) {
  const space = useSpace();
  if (!space) {
    return null;
  }
  if (!canOpen(space.grants, module)) {
    return <p className="muted">{t("api.forbidden")}</p>;
  }
  return (
    <section className="panel stack">
      <h1 className="module-title">{t(moduleLabel[module])}</h1>
      <p className="muted">{t("shell.soon")}</p>
    </section>
  );
}
