import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { useSnapshot } from "valtio";
import { normalizeInstanceInput } from "../api/auth";
import { getRest } from "../api/client";
import type { List, Shortcut, ShortcutType } from "../api/types";
import { iconForShortcut } from "../app/column-content";
import { shortcutLabel } from "../app/shortcuts";
import { t } from "../i18n/pt-BR";
import {
  COLUMN_TYPES,
  addColumn,
  columnNeedsValue,
  columnShortcut,
  moveColumn,
  renameColumn,
  type ColumnType,
} from "../lib/columns";
import { navigate } from "../lib/router";
import { saveShortcuts } from "../state/boot";
import { currentAccount, store, toast } from "../state/store";
import { Icon } from "../components/ui/Icon";
import { PageShell } from "../components/ui/PageShell";

export function ManageColumnsPage(): JSX.Element {
  const snap = useSnapshot(store);
  const shortcuts = snap.shortcuts;
  const account = currentAccount();
  const [type, setType] = useState<ColumnType>("local");
  const [host, setHost] = useState("");
  const [tag, setTag] = useState("");
  const [listId, setListId] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [lists, setLists] = useState<List[]>([]);
  const [listsLoading, setListsLoading] = useState(true);

  const typeLabels: Record<ShortcutType, string> = {
    home: t.home,
    local: t.local,
    federated: t.federated,
    "remote-local": t.remoteLocal,
    "remote-federated": t.remoteFederated,
    hashtag: t.hashtag,
    list: t.lists,
    notifications: t.notifications,
    mentions: t.mentions,
    direct: t.messages,
    bookmarks: t.bookmarks,
    favourites: t.favourites,
    boosts: t.boosts,
    trending: t.trending,
  };

  useEffect(() => {
    if (!account) {
      setListsLoading(false);
      return;
    }
    let cancelled = false;
    setListsLoading(true);
    void (async () => {
      try {
        const items = await getRest(account.instance, account.accessToken).v1.lists.list();
        if (!cancelled) setLists(items);
      } catch (err) {
        console.warn("[oltn] column lists load failed", err);
        if (!cancelled) setLists([]);
      } finally {
        if (!cancelled) setListsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account?.id, account?.instance, account?.accessToken, snap.currentAccountId]);

  const remote = type === "remote-local" || type === "remote-federated";
  const selectedList = lists.find((item) => item.id === listId);
  const hasValue =
    !columnNeedsValue(type) ||
    (remote ? !!normalizeInstanceInput(host) : type === "hashtag" ? !!tag.trim() : !!selectedList);

  const defaultLabel = (
    columnType: ShortcutType,
    value: string | undefined,
    list?: Pick<List, "title">,
  ): string => {
    if (columnType === "remote-local") return `${value ?? ""} · ${t.remoteLocal}`;
    if (columnType === "remote-federated") return `${value ?? ""} · ${t.remoteFederated}`;
    if (columnType === "hashtag") return `#${value ?? ""}`;
    if (columnType === "list") return list?.title || t.listFallback;
    return typeLabels[columnType];
  };

  const resetForm = (): void => {
    setHost("");
    setTag("");
    setListId("");
    setLabel("");
    setError(null);
  };

  const add = (e: Event): void => {
    e.preventDefault();
    setError(null);
    const parsedHost = remote ? normalizeInstanceInput(host) : null;
    const cleanTag = tag.trim().replace(/^#+/, "").toLowerCase();
    const value = remote
      ? parsedHost?.host
      : type === "hashtag"
        ? cleanTag
        : type === "list"
          ? selectedList?.id
          : undefined;
    if (columnNeedsValue(type) && !value) {
      setError(t.columnValueMissing);
      return;
    }
    const candidate = columnShortcut(
      type,
      label.trim() || defaultLabel(type, value, selectedList),
      value,
    );
    const next = addColumn(store.shortcuts, candidate);
    if (!next) {
      setError(t.columnExists);
      return;
    }
    saveShortcuts(next);
    resetForm();
    toast(t.columnAdded, "ok");
  };

  const saveEdit = (id: string): void => {
    if (!editLabel.trim()) {
      toast(t.columnNameRequired, "error");
      return;
    }
    saveShortcuts(renameColumn(store.shortcuts, id, editLabel));
    setEditing(null);
  };

  const remove = (id: string): void => {
    saveShortcuts(store.shortcuts.filter((shortcut) => shortcut.id !== id));
    if (editing === id) setEditing(null);
  };

  const subtitle = (shortcut: Shortcut): string => {
    if (shortcut.type === "list") return t.listFallback;
    if (shortcut.type === "hashtag") return t.hashtag;
    if (shortcut.type === "remote-local" || shortcut.type === "remote-federated") {
      return shortcut.value ?? "";
    }
    return "";
  };

  return (
    <PageShell
      title={t.manageColumns}
      subtitle={t.manageColumnsHint}
      showBack
      actions={
        <button type="button" class="btn primary" onClick={() => navigate("/")}>
          <Icon name="arrow-right-line" size={16} />
          {t.openDeck}
        </button>
      }
    >
      <div class="manage-columns">
        <section class="settings-section">
          <h1 class="section-title">{t.yourColumns}</h1>
          {shortcuts.length ? (
            <div class="column-manage-list">
              {shortcuts.map((shortcut, index) => (
                <div class="column-manage-item" key={shortcut.id}>
                  <div class="column-manage-row">
                    <span class="column-manage-icon">
                      <Icon name={iconForShortcut(shortcut)} size={18} />
                    </span>
                    <div class="row-main">
                      <div class="row-title">{shortcutLabel(shortcut)}</div>
                      {subtitle(shortcut) && <div class="row-sub">{subtitle(shortcut)}</div>}
                    </div>
                    <div class="column-manage-actions">
                      <button
                        type="button"
                        class="icon-btn"
                        disabled={index === 0}
                        title={t.moveUp}
                        aria-label={`${t.moveUp}: ${shortcutLabel(shortcut)}`}
                        onClick={() => saveShortcuts(moveColumn(store.shortcuts, shortcut.id, -1))}
                      >
                        <Icon name="arrow-up-line" size={16} />
                      </button>
                      <button
                        type="button"
                        class="icon-btn"
                        disabled={index === shortcuts.length - 1}
                        title={t.moveDown}
                        aria-label={`${t.moveDown}: ${shortcutLabel(shortcut)}`}
                        onClick={() => saveShortcuts(moveColumn(store.shortcuts, shortcut.id, 1))}
                      >
                        <Icon name="arrow-down-line" size={16} />
                      </button>
                      <button
                        type="button"
                        class="icon-btn"
                        title={t.renameColumn}
                        aria-label={`${t.renameColumn}: ${shortcutLabel(shortcut)}`}
                        onClick={() => {
                          setEditing(shortcut.id);
                          setEditLabel(shortcutLabel(shortcut));
                        }}
                      >
                        <Icon name="pencil-line" size={16} />
                      </button>
                      <button
                        type="button"
                        class="icon-btn column-remove"
                        title={t.removeColumn}
                        aria-label={`${t.removeColumn}: ${shortcutLabel(shortcut)}`}
                        onClick={() => remove(shortcut.id)}
                      >
                        <Icon name="delete-line" size={16} />
                      </button>
                    </div>
                  </div>
                  {editing === shortcut.id && (
                    <div class="column-edit-row">
                      <input
                        class="field"
                        value={editLabel}
                        aria-label={t.columnName}
                        autoFocus
                        onInput={(e) => setEditLabel((e.target as HTMLInputElement).value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveEdit(shortcut.id);
                          } else if (e.key === "Escape") {
                            setEditing(null);
                          }
                        }}
                      />
                      <button
                        type="button"
                        class="btn primary small"
                        onClick={() => saveEdit(shortcut.id)}
                      >
                        {t.save}
                      </button>
                      <button
                        type="button"
                        class="btn ghost small"
                        onClick={() => setEditing(null)}
                      >
                        {t.cancel}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div class="center-state">
              <Icon name="list-check-line" size={28} />
              <p>{t.emptyColumns}</p>
            </div>
          )}
        </section>

        <section class="settings-section">
          <h1 class="section-title">{t.addColumn}</h1>
          <p class="muted">{t.addColumnHint}</p>
          <form class="column-add-form" onSubmit={add}>
            <div class="column-add-types" role="group" aria-label={t.columnType}>
              {COLUMN_TYPES.map((columnType) => (
                <button
                  key={columnType}
                  type="button"
                  class={`column-type-chip ${type === columnType ? "active" : ""}`}
                  aria-pressed={type === columnType}
                  onClick={() => {
                    setType(columnType);
                    setError(null);
                  }}
                >
                  {typeLabels[columnType]}
                </button>
              ))}
            </div>

            {remote && (
              <label class="column-field">
                <span>{t.instanceLabel}</span>
                <input
                  class="field"
                  placeholder={t.remoteHostPlaceholder}
                  value={host}
                  autocapitalize="off"
                  spellcheck={false}
                  onInput={(e) => setHost((e.target as HTMLInputElement).value)}
                />
              </label>
            )}

            {type === "hashtag" && (
              <label class="column-field">
                <span>{t.hashtag}</span>
                <input
                  class="field"
                  placeholder="tag"
                  value={tag}
                  autocapitalize="off"
                  spellcheck={false}
                  onInput={(e) => setTag((e.target as HTMLInputElement).value)}
                />
              </label>
            )}

            {type === "list" && (
              <label class="column-field">
                <span>{t.lists}</span>
                {listsLoading ? (
                  <span class="muted">{t.loading}</span>
                ) : lists.length ? (
                  <select
                    class="field"
                    value={listId}
                    onChange={(e) => setListId((e.target as HTMLSelectElement).value)}
                  >
                    <option value="">{t.chooseList}</option>
                    {lists.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span class="muted">{t.noListsForColumn}</span>
                )}
              </label>
            )}

            <label class="column-field">
              <span>{t.columnName}</span>
              <input
                class="field"
                placeholder={t.columnNamePlaceholder}
                value={label}
                onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
              />
            </label>

            {error && <p class="column-error">{error}</p>}

            <button type="submit" class="btn primary" disabled={!hasValue}>
              <Icon name="plus-line" size={16} />
              {t.addColumn}
            </button>
          </form>
        </section>
      </div>
    </PageShell>
  );
}
