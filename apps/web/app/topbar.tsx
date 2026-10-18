"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { t } from "@wanted/shared";
import { api } from "@/lib/api";
import { useExitGhost } from "@/lib/exit-ghost";
import {
  isNoticeTone,
  noticeEvent,
  notify,
  readNoticeDetail,
  requestRefresh,
  type NoticeDetail,
  type NoticeInput,
  type NoticeTone,
} from "@/lib/notify";

type Notice = {
  id: string;
  title: string;
  body: string;
  at: string;
  seen: boolean;
  tone: NoticeTone;
  source: string;
  detail?: NoticeDetail;
  remote?: boolean;
  actorId?: string | null;
  actorName?: string;
};

export type ProfileInfo = {
  email: string;
  kind: string;
  parentName?: string;
};

type RemoteNotice = {
  id: string;
  title: string;
  body: string;
  tone: string;
  detail: unknown;
  actorId: string | null;
  actorName: string;
  at: string;
};

const maxNotices = 50;
const maxHidden = 200;
const bubbleMs = 3800;
const bubbleLeaveMs = 260;
const pollMs = 15_000;

type NoticeBox = {
  muted: boolean;
  items: Notice[];
  hidden: string[];
  clearedAt?: string;
  syncedAt?: string;
};

export function AppBar({
  section,
  userId,
  name,
  image,
  settingsHref,
  menuOpen,
  onMenu,
  feed,
  profile,
}: {
  section: string;
  userId: string;
  name: string;
  image: string | null;
  settingsHref: string | null;
  menuOpen?: boolean;
  onMenu?: () => void;
  feed?: { parent: boolean };
  profile?: ProfileInfo;
}) {
  const [showProfile, setShowProfile] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const root = useRef<HTMLElement>(null);
  const [open, setOpen] = useState<"notices" | "profile" | null>(null);
  const [box, setBox] = useState<NoticeBox>({ muted: false, items: [], hidden: [] });
  const [bubble, setBubble] = useState<{ item: Notice; leaving: boolean } | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const boxRef = useRef(box);
  const openRef = useRef(open);
  const viewingRef = useRef(viewing);
  const bubbleTimer = useRef(0);
  const leaveTimer = useRef(0);
  const feedOn = Boolean(feed) && userId !== "";
  boxRef.current = box;
  openRef.current = open;
  viewingRef.current = viewing;

  useEffect(() => {
    const loaded = readNotices(userId);
    boxRef.current = loaded;
    setBox(loaded);
    setOpen(null);
  }, [userId]);

  function showBubble(item: Notice) {
    if (boxRef.current.muted || openRef.current === "notices" || viewingRef.current) {
      return;
    }
    window.clearTimeout(bubbleTimer.current);
    window.clearTimeout(leaveTimer.current);
    setBubble({ item, leaving: false });
    bubbleTimer.current = window.setTimeout(() => {
      setBubble((current) => (current ? { ...current, leaving: true } : current));
      leaveTimer.current = window.setTimeout(() => setBubble(null), bubbleLeaveMs);
    }, bubbleMs);
  }

  useEffect(() => {
    function onNotice(event: Event) {
      const detail = (event as CustomEvent<NoticeInput>).detail;
      if (!detail?.title) {
        return;
      }
      const item: Notice = {
        id: crypto.randomUUID(),
        title: detail.title,
        body: detail.body ?? "",
        at: new Date().toISOString(),
        seen: false,
        tone: detail.tone ?? "info",
        source: detail.source ?? "",
        detail: detail.detail,
        actorId: userId,
        actorName: name,
      };
      update({ ...boxRef.current, items: [item, ...boxRef.current.items].slice(0, maxNotices) });
      showBubble(item);
      if (feedOn && detail.module && detail.share !== false && detail.tone !== "error") {
        void publish(item, detail.module);
      }
    }
    window.addEventListener(noticeEvent, onNotice);
    return () => {
      window.removeEventListener(noticeEvent, onNotice);
      window.clearTimeout(bubbleTimer.current);
      window.clearTimeout(leaveTimer.current);
    };
  }, [userId, name, feedOn]);

  async function publish(item: Notice, module: string) {
    try {
      const response = await api("/api/workspace/activity", {
        method: "POST",
        body: JSON.stringify({ module, title: item.title, body: item.body, tone: item.tone, detail: item.detail ?? {} }),
      });
      if (!response.ok) {
        return;
      }
      const saved = (await response.json()) as RemoteNotice;
      if (viewingRef.current === item.id) {
        setViewing(saved.id);
      }
      patchNotice(item.id, (current) => ({
        ...current,
        id: saved.id,
        remote: true,
        actorId: saved.actorId,
        actorName: saved.actorName,
      }));
    } catch {
      /* el aviso queda solo en este navegador */
    }
  }

  useEffect(() => {
    if (!feedOn) {
      return;
    }
    let stopped = false;
    let first = true;
    async function sync() {
      const current = boxRef.current;
      const cursor = first ? undefined : current.syncedAt;
      try {
        const response = await api(
          cursor ? `/api/workspace/activity?after=${encodeURIComponent(cursor)}` : "/api/workspace/activity",
        );
        if (!response.ok || stopped) {
          return;
        }
        const remote = (await response.json()) as RemoteNotice[];
        mergeRemote(remote, first);
      } catch {
        /* sin conexión: se reintenta en la próxima vuelta */
      } finally {
        first = false;
      }
    }
    void sync();
    const timer = window.setInterval(() => void sync(), pollMs);
    function onFocus() {
      if (document.visibilityState === "visible") {
        void sync();
      }
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [feedOn, userId]);

  function mergeRemote(remote: RemoteNotice[], initial: boolean) {
    const current = boxRef.current;
    const hidden = new Set(current.hidden);
    const known = new Map(current.items.map((item) => [item.id, item]));
    const lastSync = current.syncedAt ? Date.parse(current.syncedAt) : null;
    const cleared = current.clearedAt ? Date.parse(current.clearedAt) : null;
    const incoming: Notice[] = [];
    let items = current.items;
    for (const entry of remote) {
      if (hidden.has(entry.id) || (cleared !== null && Date.parse(entry.at) <= cleared)) {
        continue;
      }
      const detail = readNoticeDetail(entry.detail);
      const existing = known.get(entry.id);
      if (existing) {
        if (detail?.restoredAt && !existing.detail?.restoredAt) {
          items = items.map((item) =>
            item.id === entry.id ? { ...item, detail: { ...item.detail, restoredAt: detail.restoredAt } } : item,
          );
        }
        continue;
      }
      const mine = entry.actorId === userId;
      if (mine && items.some((item) => !item.remote && item.title === entry.title && item.body === entry.body)) {
        continue;
      }
      const fresh = lastSync !== null && Date.parse(entry.at) > lastSync;
      incoming.push({
        id: entry.id,
        title: entry.title,
        body: entry.body,
        at: entry.at,
        seen: mine || !fresh,
        tone: isNoticeTone(entry.tone) ? entry.tone : "info",
        source: t("modules.tables"),
        detail,
        remote: true,
        actorId: entry.actorId,
        actorName: entry.actorName,
      });
    }
    const newest = remote.reduce<string | undefined>(
      (latest, entry) => (!latest || Date.parse(entry.at) > Date.parse(latest) ? entry.at : latest),
      current.syncedAt,
    );
    const merged = [...incoming, ...items]
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, maxNotices);
    update({ ...current, items: merged, syncedAt: newest ?? new Date().toISOString() });
    if (!initial) {
      const other = incoming.find((item) => item.actorId !== userId && !item.seen);
      if (other) {
        showBubble(other);
      }
    }
  }

  useEffect(() => {
    if (open === "notices") {
      window.clearTimeout(bubbleTimer.current);
      window.clearTimeout(leaveTimer.current);
      setBubble(null);
    }
  }, [open]);

  useEffect(() => {
    setOpen(null);
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(null);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(null);
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function update(next: NoticeBox) {
    boxRef.current = next;
    setBox(next);
    writeNotices(userId, next);
  }

  function patchNotice(id: string, change: (item: Notice) => Notice) {
    const current = boxRef.current;
    update({ ...current, items: current.items.map((item) => (item.id === id ? change(item) : item)) });
  }

  function removeNotice(id: string) {
    const current = boxRef.current;
    const target = current.items.find((item) => item.id === id);
    update({
      ...current,
      items: current.items.filter((item) => item.id !== id),
      hidden: target?.remote ? [id, ...current.hidden].slice(0, maxHidden) : current.hidden,
    });
  }

  function clearNotices() {
    update({ ...boxRef.current, items: [], hidden: [], clearedAt: new Date().toISOString() });
  }

  function openNotice(id: string) {
    window.clearTimeout(bubbleTimer.current);
    window.clearTimeout(leaveTimer.current);
    setBubble(null);
    setOpen(null);
    patchNotice(id, (item) => ({ ...item, seen: true }));
    setViewing(id);
  }

  const viewed = viewing ? box.items.find((item) => item.id === viewing) ?? null : null;

  async function signOut() {
    await api("/api/auth/sign-out", { method: "POST" });
    router.push("/");
  }

  const unseenItems = box.items.filter((item) => !item.seen);
  const unseen = !box.muted && unseenItems.length > 0;
  const dotTone = unseenItems[0]?.tone ?? "info";

  return (
    <header className="app-bar" ref={root}>
      {onMenu ? (
        <button
          className="bar-icon app-menu-toggle"
          type="button"
          aria-label={menuOpen ? t("shell.collapseNav") : t("shell.expandNav")}
          aria-expanded={menuOpen === true}
          title={menuOpen ? t("shell.collapseNav") : t("shell.expandNav")}
          onClick={onMenu}
        >
          <MenuIcon />
        </button>
      ) : null}
      <BrandLogo />
      <span className="app-rule" aria-hidden="true" />
      <span className="app-section">{section}</span>
      <div className="app-tools">
        <div className="app-pop">
          <button
            className={box.muted ? "bar-icon is-muted" : "bar-icon"}
            type="button"
            aria-label={t("shell.notifications")}
            aria-expanded={open === "notices"}
            onClick={() => setOpen((current) => (current === "notices" ? null : "notices"))}
          >
            {box.muted ? <BellOffIcon /> : <BellIcon />}
            {unseen ? <span className={`bar-dot tone-${dotTone}`} /> : null}
          </button>
          {bubble ? (
            <button
              key={bubble.item.id}
              type="button"
              className={`notice-bubble tone-${bubble.item.tone}${bubble.leaving ? " is-leaving" : ""}`}
              role="status"
              aria-live="polite"
              onClick={() => openNotice(bubble.item.id)}
            >
              <span className="notice-tone" aria-hidden="true" />
              <span className="notice-bubble-text">
                <strong>{bubble.item.title}</strong>
                {bubble.item.body ? <span>{richText(bubble.item.body)}</span> : null}
              </span>
            </button>
          ) : null}
          {open === "notices" ? (
            <div className="app-menu notice-panel" role="dialog" aria-label={t("shell.notifications")}>
              <div className="notice-head">
                <p className="menu-title">{t("shell.notifications")}</p>
                {unseenItems.length > 0 ? <span className="notice-count">{unseenItems.length}</span> : null}
                <div className="notice-head-actions">
                  <button
                    type="button"
                    aria-label={t("shell.markSeen")}
                    data-tip={t("shell.markSeen")}
                    disabled={unseenItems.length === 0}
                    onClick={() => update({ ...box, items: box.items.map((item) => ({ ...item, seen: true })) })}
                  >
                    <CheckIcon />
                  </button>
                  <button
                    type="button"
                    aria-label={box.muted ? t("shell.unmuteNotifications") : t("shell.muteNotifications")}
                    data-tip={box.muted ? t("shell.unmuteNotifications") : t("shell.muteNotifications")}
                    aria-pressed={box.muted}
                    onClick={() => update({ ...box, muted: !box.muted })}
                  >
                    {box.muted ? <BellIcon /> : <BellOffIcon />}
                  </button>
                  <button
                    type="button"
                    aria-label={t("shell.deleteNotifications")}
                    data-tip={t("shell.deleteNotifications")}
                    disabled={box.items.length === 0}
                    onClick={clearNotices}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
              {box.muted ? <p className="notice-muted">{t("shell.muted")}</p> : null}
              {box.items.length === 0 ? (
                <div className="notice-empty">
                  <BellIcon />
                  <p>{t("shell.noNotifications")}</p>
                </div>
              ) : (
                <ul className="notice-list">
                  {box.items.map((item) => (
                    <li key={item.id} className={`notice-item tone-${item.tone}${item.seen ? " is-seen" : ""}`}>
                      <button className="notice-open" type="button" onClick={() => openNotice(item.id)}>
                        <span className="notice-tone" role="img" aria-label={t(toneLabel[item.tone])} />
                        <span className="notice-text">
                          <strong>{item.title}</strong>
                          {item.body ? <span>{richText(item.body)}</span> : null}
                          <span className="notice-meta">
                            {item.source ? `${item.source} · ` : ""}
                            {feed?.parent && item.actorName && item.actorId !== userId ? (
                              <span className="notice-actor">{item.actorName} · </span>
                            ) : null}
                            {timeAgo(item.at)}
                            {restoreState(item) === "open" ? (
                              <span className="notice-flag">{t("shell.restore")}</span>
                            ) : null}
                            {restoreState(item) === "done" ? (
                              <span className="notice-flag is-done">{t("shell.restored")}</span>
                            ) : null}
                          </span>
                        </span>
                      </button>
                      <button
                        className="notice-dismiss"
                        type="button"
                        aria-label={t("shell.dismissNotice")}
                        title={t("shell.dismissNotice")}
                        onClick={() => removeNotice(item.id)}
                      >
                        <CloseIcon />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
        <div className="app-pop">
          <button
            className="profile-button"
            type="button"
            aria-label={t("shell.profile")}
            aria-expanded={open === "profile"}
            onClick={() => setOpen((current) => (current === "profile" ? null : "profile"))}
          >
            <Avatar name={name} image={image} />
            <span className="profile-name">{name}</span>
          </button>
          {open === "profile" ? (
            <div className="app-menu profile-menu" role="menu" aria-label={t("shell.profile")}>
              <div className="profile-head">
                <Avatar name={name} image={image} />
                <div className="profile-head-text">
                  <strong>{name}</strong>
                  {profile?.email ? <span>{profile.email}</span> : null}
                </div>
              </div>
              <div className="profile-items">
                <button
                  className="profile-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(null);
                    setShowProfile(true);
                  }}
                >
                  <UserIcon />
                  {t("shell.viewProfile")}
                </button>
                {settingsHref ? (
                  <Link className="profile-item" href={settingsHref} role="menuitem" onClick={() => setOpen(null)}>
                    <GearIcon />
                    {t("shell.globalSettings")}
                  </Link>
                ) : null}
              </div>
              <div className="profile-items is-foot">
                <button className="profile-item" type="button" role="menuitem" onClick={() => void signOut()}>
                  <SignOutIcon />
                  {t("auth.signOut")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {showProfile ? (
        <ProfilePanel
          name={name}
          image={image}
          profile={profile}
          settingsHref={settingsHref}
          onClose={() => setShowProfile(false)}
          onSignOut={() => void signOut()}
        />
      ) : null}
      {viewed ? (
        <NoticePanel
          item={viewed}
          userId={userId}
          showActor={Boolean(feed?.parent)}
          onClose={() => setViewing(null)}
          onRestored={(item, result) => {
            patchNotice(item.id, (current) => ({
              ...current,
              detail: { ...current.detail, restoredAt: new Date().toISOString() },
            }));
            if (item.remote) {
              void api(`/api/workspace/activity/${item.id}/restored`, { method: "POST" }).catch(() => undefined);
            }
            if (item.detail?.restore) {
              requestRefresh(item.detail.restore.refresh);
            }
            notify({
              title: t("shell.restoreDone"),
              body: result ? `${item.body} → ${quote(result)}` : item.body,
              tone: "success",
              source: item.source,
              module: "tables",
              detail: {
                facts: [
                  ...(item.detail?.facts ?? []),
                  ...(item.actorName && item.actorId !== userId
                    ? [{ label: t("shell.deletedBy"), value: item.actorName }]
                    : []),
                ],
              },
            });
          }}
        />
      ) : null}
    </header>
  );
}

function quote(name: string) {
  return `«${name}»`;
}

function richText(text: string) {
  return text.split(/(«[^»]*»)/g).map((part, index) =>
    part.startsWith("«") && part.endsWith("»") ? (
      <span key={index} className="notice-name">
        {part.slice(1, -1)}
      </span>
    ) : (
      part
    ),
  );
}

function restoreState(item: Notice): "none" | "open" | "done" | "gone" {
  const restore = item.detail?.restore;
  if (!restore) {
    return "none";
  }
  if (item.detail?.restoredAt) {
    return "done";
  }
  return Date.now() < Date.parse(restore.until) ? "open" : "gone";
}

const dateTime = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });

function timeLeft(until: string) {
  const minutes = Math.max(0, Math.round((Date.parse(until) - Date.now()) / 60000));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
}

function NoticePanel({
  item,
  userId,
  showActor,
  onClose,
  onRestored,
}: {
  item: Notice;
  userId: string;
  showActor: boolean;
  onClose: () => void;
  onRestored: (item: Notice, renamedTo: string | null) => void;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [, setTick] = useState(0);
  const state = restoreState(item);
  const restore = item.detail?.restore;
  const facts = item.detail?.facts ?? [];
  const items = item.detail?.items ?? [];
  const more = item.detail?.more ?? 0;
  const backdrop = useRef<HTMLDivElement>(null);
  useExitGhost(backdrop);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    const timer = window.setInterval(() => setTick((value) => value + 1), 30_000);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearInterval(timer);
    };
  }, [onClose]);

  async function runRestore() {
    if (!restore) {
      return;
    }
    setWorking(true);
    setError("");
    try {
      const response = await api(restore.path, {
        method: "POST",
        body: JSON.stringify(restore.body ?? {}),
      });
      const text = await response.text();
      const parsed = text ? (JSON.parse(text) as { message?: string | string[]; name?: string }) : {};
      if (!response.ok) {
        const message = Array.isArray(parsed.message) ? parsed.message.join(" ") : parsed.message;
        setError(message || t("api.invalidBody"));
        return;
      }
      const original = facts[0]?.value ?? "";
      onRestored(item, parsed.name && parsed.name !== original ? parsed.name : null);
    } catch {
      setError(t("api.invalidBody"));
    } finally {
      setWorking(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop" ref={backdrop} onMouseDown={onClose}>
      <div
        className={`modal notice-detail tone-${item.tone}`}
        role="dialog"
        aria-modal="true"
        aria-label={t("shell.noticeDetail")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="notice-detail-head">
          <span className="notice-tone" aria-hidden="true" />
          <span className="notice-detail-kind">{t(toneLabel[item.tone])}</span>
          <button
            className="ghost modal-close"
            type="button"
            aria-label={t("shell.close")}
            title={t("shell.close")}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="notice-detail-title">
          <h2>{item.title}</h2>
          {item.body ? <p>{richText(item.body)}</p> : null}
        </div>

        <dl className="notice-facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
          {showActor && item.actorName ? (
            <div>
              <dt>{t("shell.noticeActor")}</dt>
              <dd>
                <span className="notice-actor-chip">
                  <span className="notice-actor-avatar" aria-hidden="true">
                    {initials(item.actorName)}
                  </span>
                  {item.actorName}
                </span>
                {item.actorId === userId ? <span className="notice-facts-soft"> · {t("shell.you")}</span> : null}
              </dd>
            </div>
          ) : null}
          {item.source ? (
            <div>
              <dt>{t("shell.noticeOrigin")}</dt>
              <dd>{item.source}</dd>
            </div>
          ) : null}
          <div>
            <dt>{t("shell.noticeWhen")}</dt>
            <dd>
              {dateTime.format(new Date(item.at))} <span className="notice-facts-soft">· {timeAgo(item.at)}</span>
            </dd>
          </div>
        </dl>

        {items.length > 0 ? (
          <div className="notice-items">
            {item.detail?.itemsLabel ? <p className="notice-items-label">{item.detail.itemsLabel}</p> : null}
            <ul>
              {items.map((entry, index) => (
                <li key={`${entry}-${index}`}>{entry}</li>
              ))}
              {more > 0 ? (
                <li className="is-more">
                  {t("shell.andMore")} {more} {t("shell.more")}
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {restore ? (
          <div className={`notice-restore is-${state}`}>
            {state === "open" ? (
              <>
                <div className="notice-restore-text">
                  <span>
                    {t("shell.restoreUntil")} {dateTime.format(new Date(restore.until))}
                  </span>
                  <span className="notice-facts-soft">
                    {t("shell.restoreLeft")} {timeLeft(restore.until)}
                  </span>
                </div>
                <button className="raised-button" type="button" disabled={working} onClick={() => void runRestore()}>
                  <RestoreIcon />
                  {working ? t("shell.restoring") : t("shell.restore")}
                </button>
              </>
            ) : null}
            {state === "done" ? (
              <p className="notice-restore-text">
                <CheckIcon />
                {t("shell.restoredOn")} · {dateTime.format(new Date(item.detail?.restoredAt ?? item.at))}
              </p>
            ) : null}
            {state === "gone" ? <p className="notice-restore-text">{t("shell.restoreGone")}</p> : null}
            {error ? <p className="notice-restore-error">{error}</p> : null}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function RestoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 4.5v4h4" />
    </svg>
  );
}

function Avatar({ name, image, size }: { name: string; image: string | null; size?: "large" }) {
  const className = size === "large" ? "avatar avatar-large" : "avatar";
  if (image) {
    return (
      <span className={className}>
        <img src={image} alt="" />
      </span>
    );
  }
  return <span className={className}>{initials(name)}</span>;
}

const kindLabel: Record<string, "accounts.admin" | "accounts.parent" | "accounts.child"> = {
  admin: "accounts.admin",
  parent: "accounts.parent",
  child: "accounts.child",
};

function ProfilePanel({
  name,
  image,
  profile,
  settingsHref,
  onClose,
  onSignOut,
}: {
  name: string;
  image: string | null;
  profile?: ProfileInfo;
  settingsHref: string | null;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const backdrop = useRef<HTMLDivElement>(null);
  useExitGhost(backdrop);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const kind = profile?.kind && kindLabel[profile.kind] ? t(kindLabel[profile.kind]) : "";

  return createPortal(
    <div className="modal-backdrop" ref={backdrop} onMouseDown={onClose}>
      <div
        className="modal profile-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t("shell.profile")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="ghost modal-close profile-close"
          type="button"
          aria-label={t("shell.close")}
          title={t("shell.close")}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
        <div className="profile-hero">
          <Avatar name={name} image={image} size="large" />
          <div className="profile-hero-text">
            <h2>{name}</h2>
            {profile?.email ? <p>{profile.email}</p> : null}
          </div>
          <div className="profile-tags">
            {kind ? <span className="profile-tag is-strong">{kind}</span> : null}
          </div>
        </div>

        <dl className="notice-facts">
          {kind ? (
            <div>
              <dt>{t("shell.accountType")}</dt>
              <dd>{kind}</dd>
            </div>
          ) : null}
          {profile?.parentName ? (
            <div>
              <dt>{t("shell.parentAccount")}</dt>
              <dd>{profile.parentName}</dd>
            </div>
          ) : null}
          {profile?.email ? (
            <div>
              <dt>{t("shell.email")}</dt>
              <dd>{profile.email}</dd>
            </div>
          ) : null}
        </dl>

        <div className="profile-panel-foot">
          {settingsHref ? (
            <Link className="profile-item is-outline" href={settingsHref} onClick={onClose}>
              <GearIcon />
              {t("shell.globalSettings")}
            </Link>
          ) : (
            <span />
          )}
          <button className="profile-item" type="button" onClick={onSignOut}>
            <SignOutIcon />
            {t("auth.signOut")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c1.2-3.2 3.9-5 7-5s5.8 1.8 7 5" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2M12 18.5v2M4.8 6.2l1.5 1.5M17.7 16.3l1.5 1.5M3.5 12h2M18.5 12h2M4.8 17.8l1.5-1.5M17.7 7.7l1.5-1.5" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M10 16l-4-4 4-4" />
      <path d="M6 12h10" />
    </svg>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function readNotices(userId: string): NoticeBox {
  const empty: NoticeBox = { muted: false, items: [], hidden: [] };
  if (!userId || typeof window === "undefined") {
    return empty;
  }
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) {
      return empty;
    }
    const parsed = JSON.parse(raw) as Partial<NoticeBox>;
    return {
      muted: parsed.muted === true,
      items: Array.isArray(parsed.items)
        ? parsed.items.map(readNotice).filter((item): item is Notice => item !== null)
        : [],
      hidden: Array.isArray(parsed.hidden)
        ? parsed.hidden.filter((id): id is string => typeof id === "string").slice(0, maxHidden)
        : [],
      clearedAt: typeof parsed.clearedAt === "string" ? parsed.clearedAt : undefined,
      syncedAt: typeof parsed.syncedAt === "string" ? parsed.syncedAt : undefined,
    };
  } catch {
    return empty;
  }
}

function writeNotices(userId: string, box: NoticeBox) {
  if (!userId) {
    return;
  }
  window.localStorage.setItem(storageKey(userId), JSON.stringify(box));
}

function storageKey(userId: string) {
  return `wanted.notices.${userId}`;
}

function readNotice(value: unknown): Notice | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const item = value as Partial<Notice>;
  if (
    typeof item.id !== "string" ||
    typeof item.title !== "string" ||
    typeof item.body !== "string" ||
    typeof item.at !== "string" ||
    typeof item.seen !== "boolean"
  ) {
    return null;
  }
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    at: item.at,
    seen: item.seen,
    tone: isNoticeTone(item.tone) ? item.tone : "info",
    source: typeof item.source === "string" ? item.source : "",
    detail: readNoticeDetail(item.detail),
    remote: item.remote === true,
    actorId: typeof item.actorId === "string" ? item.actorId : null,
    actorName: typeof item.actorName === "string" ? item.actorName : undefined,
  };
}

const toneLabel = {
  success: "shell.toneSuccess",
  info: "shell.toneInfo",
  warning: "shell.toneWarning",
  error: "shell.toneError",
} as const;

const relative = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

function timeAgo(at: string) {
  const seconds = Math.round((new Date(at).getTime() - Date.now()) / 1000);
  if (!Number.isFinite(seconds) || seconds > -45) {
    return t("shell.justNow");
  }
  const minutes = Math.round(seconds / 60);
  if (minutes > -60) {
    return relative.format(minutes, "minute");
  }
  const hours = Math.round(minutes / 60);
  if (hours > -24) {
    return relative.format(hours, "hour");
  }
  return relative.format(Math.round(hours / 24), "day");
}

export function BrandLogo({ size = "bar" }: { size?: "bar" | "login" }) {
  const [name, mark] = t("app.name").split(" ");
  return (
    <strong className={size === "login" ? "app-brand brand-login" : "app-brand"} aria-label={t("app.name")}>
      <span className="brand-name">{name}</span>
      <span className="brand-mark">{mark}</span>
    </strong>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h16v14H4z" />
      <path d="M9 5v14" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9a6 6 0 1 1 12 0c0 7 2 7 2 9H4c0-2 2-2 2-9" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

function BellOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 4.2A6 6 0 0 1 18 9c0 3 .4 4.8 .9 6" />
      <path d="M6 9c0 7-2 7-2 9h12" />
      <path d="M10 20a2 2 0 0 0 4 0" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 13h8l1-13" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
