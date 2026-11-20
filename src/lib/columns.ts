import type { Shortcut, ShortcutType } from "../api/types";

/** Timeline types that can be added as a deck column or floating panel. */
export const COLUMN_TYPES = [
  "home",
  "local",
  "federated",
  "remote-local",
  "remote-federated",
  "hashtag",
  "list",
  "notifications",
  "mentions",
  "direct",
  "bookmarks",
  "favourites",
  "boosts",
  "trending",
] as const satisfies readonly ShortcutType[];

export type ColumnType = (typeof COLUMN_TYPES)[number];

/** Stable id shared by new and legacy shortcut entries. */
export function columnId(type: ShortcutType, value?: string): string {
  return value ? `${type}:${value}` : type;
}

export function columnShortcut(type: ShortcutType, label: string, value?: string): Shortcut {
  return { id: columnId(type, value), type, label, value };
}

/** Two columns are the same when they read the same timeline target. */
export function sameColumnTarget(a: Shortcut, b: Shortcut): boolean {
  return a.type === b.type && (a.value ?? "") === (b.value ?? "");
}

/** Adds a column unless that timeline is already present. */
export function addColumn(shortcuts: readonly Shortcut[], candidate: Shortcut): Shortcut[] | null {
  if (shortcuts.some((shortcut) => sameColumnTarget(shortcut, candidate))) return null;
  return [...shortcuts, candidate];
}

/** Moves a column one slot up (-1) or down (1). */
export function moveColumn(shortcuts: readonly Shortcut[], id: string, delta: number): Shortcut[] {
  const next = [...shortcuts];
  const index = next.findIndex((shortcut) => shortcut.id === id);
  if (index < 0) return next;
  const target = Math.min(next.length - 1, Math.max(0, index + delta));
  if (target === index) return next;
  const [column] = next.splice(index, 1);
  next.splice(target, 0, column);
  return next;
}

/** Renames only the matching column; blank labels are ignored. */
export function renameColumn(
  shortcuts: readonly Shortcut[],
  id: string,
  label: string,
): Shortcut[] {
  const clean = label.trim();
  if (!clean) return [...shortcuts];
  return shortcuts.map((shortcut) =>
    shortcut.id === id ? { ...shortcut, label: clean } : shortcut,
  );
}

/** Whether the type needs a host, tag or list id before it can be added. */
export function columnNeedsValue(type: ShortcutType): boolean {
  return (
    type === "remote-local" || type === "remote-federated" || type === "hashtag" || type === "list"
  );
}
