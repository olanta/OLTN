import type { Shortcut } from "../api/types";
import { t } from "../i18n/pt-BR";

export function shortcutRoute(shortcut: Shortcut): string {
  switch (shortcut.type) {
    case "home":
      return "/";
    case "local":
      return "/p/l";
    case "federated":
      return "/p";
    case "remote-local":
      return `/${encodeURIComponent(shortcut.value ?? "")}/p/l`;
    case "remote-federated":
      return `/${encodeURIComponent(shortcut.value ?? "")}/p`;
    case "notifications":
      return "/notifications";
    case "mentions":
      return "/mentions";
    case "direct":
      return "/messages";
    case "bookmarks":
      return "/b";
    case "favourites":
      return "/f";
    case "boosts":
      return "/boosts";
    case "trending":
      return "/trending";
    case "list":
      return `/l/${encodeURIComponent(shortcut.value ?? "")}`;
    case "hashtag":
      return `/t/${encodeURIComponent(shortcut.value ?? "")}`;
    default:
      return "/";
  }
}

export function shortcutLabel(shortcut: Shortcut): string {
  switch (shortcut.type) {
    case "local":
      return t.local;
    case "federated":
      return t.federated;
    case "direct":
      return t.messages;
    case "hashtag":
      return `#${shortcut.value ?? ""}`;
    case "list":
      return shortcut.label || t.listFallback;
    case "remote-local":
      return shortcut.label || `${shortcut.value ?? ""} · ${t.remoteLocal}`;
    case "remote-federated":
      return shortcut.label || `${shortcut.value ?? ""} · ${t.remoteFederated}`;
    default:
      return shortcut.label;
  }
}
