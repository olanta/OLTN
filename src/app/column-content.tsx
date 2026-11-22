import type { JSX } from "preact";
import { useSnapshot } from "valtio";
import type { Shortcut } from "../api/types";
import { ConversationsFeed } from "../components/feed/ConversationsFeed";
import { HomeGallery } from "../components/feed/HomeGallery";
import { NotificationsFeed } from "../components/feed/NotificationsFeed";
import { Timeline } from "../components/feed/Timeline";
import { TrendingFeed } from "../components/feed/TrendingFeed";
import { t } from "../i18n/pt-BR";
import { store } from "../state/store";

export function iconForShortcut(shortcut: Shortcut): string {
  switch (shortcut.type) {
    case "home":
      return "home-3-line";
    case "local":
      return "globe-line";
    case "federated":
      return "rocket-line";
    case "remote-local":
      return "globe-line";
    case "remote-federated":
      return "rocket-line";
    case "notifications":
      return "notification-line";
    case "mentions":
      return "at-line";
    case "direct":
      return "mail-line";
    case "bookmarks":
      return "bookmark-line";
    case "favourites":
      return "heart-line";
    case "boosts":
      return "repeat-line";
    case "trending":
      return "trending-up-line";
    case "list":
      return "list-check-line";
    case "hashtag":
      return "hashtag-line";
    default:
      return "quill-pen-line";
  }
}

export function ColumnContent({
  shortcut,
  instance,
  refreshKey = 0,
}: {
  shortcut: Shortcut;
  instance?: string;
  refreshKey?: number;
}): JSX.Element {
  const homeGallery = useSnapshot(store).ui.homeGallery;
  switch (shortcut.type) {
    case "home":
      return homeGallery ? (
        <HomeGallery instance={instance} refreshKey={refreshKey} />
      ) : (
        <Timeline kind={{ type: "home" }} instance={instance} listenQueue refreshKey={refreshKey} />
      );
    case "local":
      return (
        <Timeline
          kind={{ type: "public", local: true }}
          instance={instance}
          refreshKey={refreshKey}
        />
      );
    case "federated":
      return <Timeline kind={{ type: "public" }} instance={instance} refreshKey={refreshKey} />;
    case "remote-local":
      return shortcut.value ? (
        <Timeline
          kind={{ type: "public", local: true }}
          instance={shortcut.value}
          emptyTitle={t.empty}
          refreshKey={refreshKey}
        />
      ) : (
        <div />
      );
    case "remote-federated":
      return shortcut.value ? (
        <Timeline
          kind={{ type: "public" }}
          instance={shortcut.value}
          emptyTitle={t.empty}
          refreshKey={refreshKey}
        />
      ) : (
        <div />
      );
    case "notifications":
      return instance ? <NotificationsFeed instance={instance} refreshKey={refreshKey} /> : <div />;
    case "mentions":
      return instance ? (
        <NotificationsFeed instance={instance} mode="mentions" refreshKey={refreshKey} />
      ) : (
        <div />
      );
    case "direct":
      return instance ? <ConversationsFeed instance={instance} refreshKey={refreshKey} /> : <div />;
    case "bookmarks":
      return <Timeline kind={{ type: "bookmarks" }} instance={instance} refreshKey={refreshKey} />;
    case "favourites":
      return <Timeline kind={{ type: "favourites" }} instance={instance} refreshKey={refreshKey} />;
    case "boosts":
      return (
        <Timeline
          kind={{ type: "boosts" }}
          instance={instance}
          emptyTitle={t.emptyBoosts}
          refreshKey={refreshKey}
        />
      );
    case "trending":
      return <TrendingFeed instance={instance} refreshKey={refreshKey} />;
    case "list":
      return (
        <Timeline
          kind={{ type: "list", listId: shortcut.value ?? "" }}
          instance={instance}
          refreshKey={refreshKey}
        />
      );
    case "hashtag":
      return (
        <Timeline
          kind={{ type: "tag", tag: shortcut.value ?? "" }}
          instance={instance}
          refreshKey={refreshKey}
        />
      );
    default:
      return <div />;
  }
}
