"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { permissionModules, t, type PermissionModule } from "@wanted/shared";
import { api } from "@/lib/api";
import { AppBar } from "../topbar";

export type Grant = { module: string; action: string; scope: string };
export type Space = {
  parentName: string;
  parentEmail: string;
  grants: Grant[];
  manageSets: boolean;
  actor: { id: string; name: string; email: string; kind: string; image: string | null };
};

const SpaceContext = createContext<Space | null>(null);

export function useSpace() {
  return useContext(SpaceContext);
}

const modulePath: Record<PermissionModule, string> = {
  tables: "/espacio/tablas",
  crm: "/espacio/crm",
  inbox: "/espacio/bandeja",
  automations: "/espacio/automatizaciones",
  members: "/espacio/ajustes",
  settings: "/espacio/ajustes",
};

// Usuarios hijo vive dentro de Configuración: el permiso de miembros también abre esa sección.
function navModule(module: PermissionModule): PermissionModule {
  return module === "members" ? "settings" : module;
}

const moduleLabel: Record<PermissionModule, "modules.tables" | "modules.crm" | "modules.inbox" | "modules.automations" | "modules.members" | "modules.settings"> = {
  tables: "modules.tables",
  crm: "modules.crm",
  inbox: "modules.inbox",
  automations: "modules.automations",
  members: "modules.members",
  settings: "modules.settings",
};

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [space, setSpace] = useState<Space | null>(null);
  const [navExpanded, setNavExpanded] = useState(false);

  useEffect(() => {
    void api("/api/workspace").then(async (response) => {
      if (!response.ok) {
        router.push("/");
        return;
      }
      setSpace((await response.json()) as Space);
    });
  }, [router]);

  useEffect(() => {
    setNavExpanded(window.localStorage.getItem("wanted.nav") === "expanded");
  }, []);

  useEffect(() => {
    if (window.matchMedia("(max-width: 899px)").matches) {
      setNavExpanded(false);
    }
  }, [pathname]);

  function toggleNav() {
    setNavExpanded((current) => {
      const next = !current;
      window.localStorage.setItem("wanted.nav", next ? "expanded" : "icons");
      return next;
    });
  }

  const modules = space
    ? [
        ...new Set(
          permissionModules
            .filter((module) => space.grants.some((grant) => grant.module === module))
            .map(navModule),
        ),
      ]
    : [];
  const settingsHref =
    space && (canOpen(space.grants, "settings") || canOpen(space.grants, "members")) ? modulePath.settings : null;

  return (
    <div className={navExpanded ? "workspace nav-expanded" : "workspace"}>
      <AppBar
        section={sectionTitle(pathname)}
        userId={space?.actor.id ?? ""}
        name={space?.actor.name ?? ""}
        image={space?.actor.image ?? null}
        settingsHref={settingsHref}
        menuOpen={navExpanded}
        onMenu={toggleNav}
        feed={space ? { parent: space.actor.kind === "parent" } : undefined}
        profile={
          space
            ? {
                email: space.actor.email,
                kind: space.actor.kind,
                parentName: space.actor.kind === "child" ? space.parentName : undefined,
              }
            : undefined
        }
      />
      {navExpanded ? (
        <button className="backdrop" type="button" aria-label={t("shell.collapseNav")} onClick={toggleNav} />
      ) : null}
      <aside className="sidebar">
        <nav className="stack">
          {modules.map((module) => (
            <Link
              key={module}
              href={modulePath[module]}
              className={pathname === modulePath[module] ? "nav-link active" : "nav-link"}
              aria-current={pathname === modulePath[module] ? "page" : undefined}
              aria-label={t(moduleLabel[module])}
            >
              <ModuleIcon module={module} />
              <span>{t(moduleLabel[module])}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <div className="workspace-body">
        <SpaceContext.Provider value={space}>
          <main className="workspace-main page stack">{children}</main>
        </SpaceContext.Provider>
      </div>
    </div>
  );
}

function sectionTitle(pathname: string) {
  const match = permissionModules.find((module) => pathname === modulePath[module] || pathname.startsWith(`${modulePath[module]}/`));
  return match ? t(moduleLabel[navModule(match)]) : t("workspace.title");
}

export function firstModulePath(grants: Grant[]) {
  const module = permissionModules.find((item) => grants.some((grant) => grant.module === item));
  return module ? modulePath[module] : "/";
}

export function canOpen(grants: Grant[], module: PermissionModule) {
  return grants.some((grant) => grant.module === module);
}

function ModuleIcon({ module }: { module: PermissionModule }) {
  const path = {
    tables: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
    crm: "M16 19v-1a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v1M10 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 19v-1a3 3 0 0 0-2-2.8M16 6.1a3 3 0 0 1 0 5.8",
    inbox: "M4 6h16v12H4zM4 8l8 6 8-6",
    automations: "M12 3v4M12 17v4M4.9 6.5l2.8 2.8M16.3 14.7l2.8 2.8M3 12h4M17 12h4M4.9 17.5l2.8-2.8M16.3 9.3l2.8-2.8",
    members: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1M17 11a2.5 2.5 0 1 0 0-5M21 19v-1a3.5 3.5 0 0 0-2.5-3.3",
    settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM12 3.5v2M12 18.5v2M4.8 6.2l1.5 1.5M17.7 16.3l1.5 1.5M3.5 12h2M18.5 12h2M4.8 17.8l1.5-1.5M17.7 7.7l1.5-1.5",
  }[module];
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

